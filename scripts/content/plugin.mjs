import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildArticleCatalog } from './catalog.mjs';
import {
  articleModule,
  latestModule,
  listingModule,
  lockedPayload,
  searchModule,
  titlesModule,
} from './modules.mjs';
import { feedHtml, renderFeeds } from './feeds.mjs';
import {
  createLock,
  LOCK_MIN_PASSWORD,
  lockedFileName,
  normalizePassword,
  sealDocument,
  veilImages,
} from './locked.mjs';
import { withoutCopies, writePhotoCopy } from './resize.mjs';
import { serveGenerated } from './serve.mjs';
import { feedFormats } from '../../src/config/feeds.mjs';
import { lockedFilePrefix } from '../../src/config/locked.mjs';
import { sharePath, siteCard, summaryShare, skyDigest } from '../share/spec.mjs';

/** A dev server without LOCKED_PASSWORD opens locked documents with this one; builds never do. */
export const PREVIEW_PASSWORD = 'preview';

// Blog and Notes share one password, so its slow derivation runs once.
const locks = new Map();
function lockWith(password) {
  if (!locks.has(password)) locks.set(password, createLock(password));
  return locks.get(password);
}
// Each collection finds the same missing password; saying so once is enough.
const told = new Set();

/**
 * `reader` is the module that draws a document page, so its static page can fetch it early.
 * `lockedDirectory` holds the collection's locked documents, which ship sealed with
 * `lockedPassword`. Without it a build leaves them out, or fails where `requirePassword`.
 * @param {{ directory?: string, moduleId?: string, basePath?: string, reader?: string, feed?: typeof import('../../src/config/feeds.mjs').blogFeed, share?: boolean, lockedDirectory?: string, lockedPassword?: string, requirePassword?: boolean }} options
 */
export function articlesPlugin({
  directory = 'content/blog',
  moduleId = 'virtual:articles',
  basePath = '/blog/',
  reader,
  feed,
  share = false,
  lockedDirectory,
  lockedPassword = process.env.LOCKED_PASSWORD,
  // CI publishes the site, so a missing password there must never drop locked documents.
  requirePassword = !!process.env.CI,
} = {}) {
  const resolvedId = `\0${moduleId}`;
  let root;
  let base;
  let assetsDir;
  let articleRoot;
  let lockedRoot;
  let publicDir;
  let copyDirectory;
  let logger;
  let password;
  let previewing = false;
  let shareCards;
  let catalog;
  let feeds;
  let bySlug;
  let assetsByMarker;
  let changedFiles;
  let sealing;
  const watched = new Set();
  const compiled = new Map();
  const shownCopies = new Map();
  const sealedFiles = new Map();
  const tell = (message, level = 'warn') => {
    if (told.has(message)) return;
    told.add(message);
    logger[level](message, { timestamp: true });
  };
  // Public images that articles show belong to the catalog too: a replaced one gets its new size.
  const ownsFile = (file) => {
    const resolved = path.resolve(file);
    return (
      [articleRoot, lockedRoot].some(
        (owner) => owner && resolved.startsWith(`${owner}${path.sep}`),
      ) || watched.has(resolved)
    );
  };
  // Locked files are named from the public folder too, as the catalog's change keys are.
  const invalidate = (file) => {
    if (file) changedFiles?.add(path.relative(articleRoot, file).replaceAll('\\', '/'));
    else changedFiles = undefined;
    catalog = undefined;
    feeds = undefined;
    bySlug = undefined;
    assetsByMarker = undefined;
  };

  // Without a password, a build leaves locked documents out rather than publish them open.
  const checkPassword = () => {
    if (previewing)
      tell(
        `加密文章本地预览密码：${PREVIEW_PASSWORD}（设置 LOCKED_PASSWORD 可改用正式密码）`,
        'info',
      );
    if (password) return;
    if (requirePassword)
      throw new Error('构建加密文章需要密码：请在仓库的 Actions secrets 里设置 LOCKED_PASSWORD');
    tell('未设置 LOCKED_PASSWORD：这次构建不含加密文章');
    catalog.articles = catalog.articles.filter((article) => !article.locked);
  };

  const readCatalog = () => {
    if (!catalog) {
      // Vite calls watchChange before the server's own watcher, so the old files stay
      // owned until the new catalog lists its own.
      watched.clear();
      catalog = buildArticleCatalog(articleRoot, (file) => watched.add(file), {
        basePath,
        cache: compiled,
        changedFiles,
        publicDir,
        copyDirectory,
        lockedRoot,
      });
      if (catalog.articles.some((article) => article.locked)) checkPassword();
      // Static share pages are built by site-share; listing entries carry the same
      // card so a client-rendered route can update its own preview. A locked document has
      // no card of its own, which would show its summary: it shares the site's.
      if (share) {
        shareCards ??= {
          publicRoot: path.resolve(root, 'public'),
          sky: skyDigest(path.resolve(root, 'public')),
        };
        for (const article of catalog.articles)
          article.share = article.locked
            ? { path: sharePath(basePath, article.slug), image: siteCard(shareCards).url }
            : summaryShare(article, basePath, shareCards);
      }
      changedFiles = new Set();
      bySlug = new Map(catalog.articles.map((article) => [article.slug, article]));
      assetsByMarker = new Map([...catalog.assets].map(([file, marker]) => [marker, file]));
    }
    return catalog;
  };
  // Feeds carry each post in full, with photos at full size. `assetUrl` names the file behind
  // an attachment marker: in builds the emitted file, in development the dev server's path.
  const fullFeeds = (assetUrl) => {
    const { articles, assets, copies } = readCatalog();
    const resized = new Set([...copies.values()].map((copy) => assets.get(copy.file)));
    const open = articles.filter((article) => !article.locked);
    return renderFeeds(open, { ...feed, basePath }, (article, url) =>
      feedHtml(article.html, { url, assetUrl, copies: resized }),
    );
  };
  const sourcePath = (marker) =>
    path.relative(root, assetsByMarker.get(marker)).replaceAll('\\', '/');
  const readFeeds = () => (feeds ??= fullFeeds((marker) => `/${sourcePath(marker)}`));
  // Each copy is made once, when an article first shows it. Where a copy cannot be made
  // or saves too little, the article shows the photo itself. `files` names the file behind
  // each attachment marker of the catalog the article comes from.
  const shownHtml = async (article, { copies, filesByMarker }, warn) => {
    const files = new Map();
    const hidden = new Set();
    const markers = new Set(article.html.match(/__ALICIA_ARTICLE_ASSET_\d+__/g));
    await Promise.all(
      [...markers].map(async (marker) => {
        const file = filesByMarker.get(marker);
        files.set(marker, file);
        const copy = copies.get(file);
        if (!copy) return;
        if (!shownCopies.has(file))
          shownCopies.set(
            file,
            writePhotoCopy(copy).catch((error) => {
              warn(`Showing ${path.relative(root, copy.source)} at full size: ${error.message}`);
              return false;
            }),
          );
        if (!(await shownCopies.get(file))) hidden.add(marker);
      }),
    );
    return { html: withoutCopies(article.html, hidden), files };
  };
  const shownArticle = async (article, warn) => {
    const { copies } = readCatalog();
    const shown = await shownHtml(article, { copies, filesByMarker: assetsByMarker }, warn);
    return articleModule({ ...article, html: shown.html }, shown.files);
  };

  // A sealed file is named by its contents, so an unchanged photo keeps its name and is
  // read and sealed once.
  const sealFile = (lock, file) => {
    const stat = fs.statSync(file);
    const version = `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    let sealed = sealedFiles.get(file);
    if (sealed?.version !== version) {
      const source = lock.seal(fs.readFileSync(file));
      sealed = { version, source, fileName: lockedFileName(assetsDir, source, path.extname(file)) };
      sealedFiles.set(file, sealed);
    }
    return sealed;
  };
  /**
   * Every locked document of a catalog, sealed: its photos, their copies and its attachments
   * each in a file of their own, and its text with the addresses of those files in another.
   * `files` holds each sealed file by its built name, and `bodies` each text's address.
   */
  const sealCatalog = async (current, warn) => {
    const files = new Map();
    const bodies = new Map();
    const locked = current.articles.filter((article) => article.locked);
    if (!locked.length) return { catalog: current, files, bodies };
    const lock = lockWith(password);
    const filesByMarker = new Map([...current.assets].map(([file, marker]) => [marker, file]));
    for (const article of locked) {
      const shown = await shownHtml(article, { copies: current.copies, filesByMarker }, warn);
      const names = {};
      const html = shown.html.replace(/__ALICIA_ARTICLE_ASSET_\d+__/g, (marker) => {
        const file = shown.files.get(marker);
        if (!file) return marker;
        const { fileName, source } = sealFile(lock, file);
        files.set(fileName, source);
        names[base + fileName] = path.basename(file);
        return base + fileName;
      });
      const veiled = veilImages(html, new Set(Object.keys(names)));
      const source = sealDocument(lock, lockedPayload(article, veiled, names));
      const fileName = lockedFileName(assetsDir, source);
      files.set(fileName, source);
      bodies.set(article.slug, base + fileName);
    }
    return { catalog: current, files, bodies };
  };
  // Sealed once per catalog, and again whenever an edit makes a new one.
  const readSealed = (warn = (message) => logger.warn(message)) => {
    const current = readCatalog();
    if (sealing?.catalog !== current)
      sealing = { catalog: current, result: sealCatalog(current, warn) };
    return sealing.result;
  };
  const readLocked = async (slug) => (await readSealed()).bodies.get(slug);
  // Constant-time lookups for per-request consumers such as static share pages.
  const readArticle = (slug) => {
    readCatalog();
    return bySlug.get(slug);
  };

  return {
    name: `local-${directory}`,
    api: { basePath, moduleId, reader, readCatalog, readArticle, readLocked },
    configResolved(config) {
      root = config.root;
      base = config.base;
      assetsDir = config.build.assetsDir;
      articleRoot = path.resolve(config.root, directory);
      lockedRoot = lockedDirectory && path.resolve(config.root, lockedDirectory);
      publicDir = config.publicDir;
      copyDirectory = path.join(config.cacheDir, 'article-images');
      logger = config.logger;
      password = lockedPassword?.trim() ? normalizePassword(lockedPassword) : undefined;
      // Sealed files are public: a short password could be guessed offline.
      if (password && [...password].length < LOCK_MIN_PASSWORD)
        throw new Error(`LOCKED_PASSWORD 至少需要 ${LOCK_MIN_PASSWORD} 个字符`);
      // Local previews need no secret; they open locked documents with a known password.
      if (!password && config.command === 'serve') {
        password = PREVIEW_PASSWORD;
        previewing = true;
      }
    },
    buildStart() {
      invalidate();
      // A build without the password it needs stops here, before any module asks again.
      if (!previewing && lockedRoot && !password && requirePassword) readCatalog();
    },
    watchChange(file) {
      if (ownsFile(file)) invalidate(file);
    },
    resolveId(id) {
      return id === moduleId || id.startsWith(`${moduleId}/`) ? `\0${id}` : null;
    },
    async load(id) {
      if (id !== resolvedId && !id.startsWith(`${resolvedId}/`)) return null;
      readCatalog();
      if (id === resolvedId) {
        for (const file of watched) this.addWatchFile(file);
        const sealed = await readSealed((message) => this.warn(message));
        return listingModule(sealed.catalog, moduleId, (slug) => sealed.bodies.get(slug));
      }
      if (id === `${resolvedId}/search`) return searchModule(catalog);
      if (id === `${resolvedId}/latest`) return latestModule(catalog, basePath);
      if (id === `${resolvedId}/titles`) return titlesModule(catalog);
      const prefix = `${resolvedId}/entry/`;
      if (!id.startsWith(prefix)) return null;
      const article = bySlug.get(decodeURIComponent(id.slice(prefix.length)));
      if (!article) throw new Error(`Unknown article module: ${id.slice(1)}`);
      // A locked document's text never becomes a module: only its sealed files ship.
      if (article.locked) throw new Error(`Locked articles have no module: ${id.slice(1)}`);
      return shownArticle(article, (message) => this.warn(message));
    },
    transformIndexHtml() {
      if (!feed) return;
      return feedFormats.map(({ path, type, label }) => ({
        tag: 'link',
        attrs: { rel: 'alternate', type, title: `${feed.title} · ${label}`, href: path },
        injectTo: 'head',
      }));
    },
    async generateBundle(_options, bundle) {
      const { files } = await readSealed((message) => this.warn(message));
      // Blog and Notes may seal the same photo, which seals to the same file.
      for (const [fileName, source] of files)
        if (!bundle[fileName]) this.emitFile({ type: 'asset', fileName, source });
      if (!feed) return;
      const emitted = new Map();
      for (const output of Object.values(bundle))
        if (output.type === 'asset')
          for (const name of output.originalFileNames ?? []) emitted.set(name, output.fileName);
      const assetUrl = (marker) => {
        const name = sourcePath(marker);
        if (!emitted.has(name)) {
          // Vite writes small files into the page itself, so feeds get a file of their own.
          const file = assetsByMarker.get(marker);
          const source = fs.readFileSync(file);
          const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 8);
          const { name: stem, ext } = path.parse(file);
          const fileName = path.posix.join(assetsDir, `${stem}-${hash}${ext}`);
          if (!bundle[fileName]) this.emitFile({ type: 'asset', fileName, source });
          emitted.set(name, fileName);
        }
        return base + emitted.get(name);
      };
      for (const [pathname, source] of Object.entries(fullFeeds(assetUrl)))
        this.emitFile({ type: 'asset', fileName: pathname.slice(1), source });
      for (const file of watched) this.addWatchFile(file);
    },
    configureServer(server) {
      if (feed)
        server.middlewares.use((req, res, next) => {
          const pathname = new URL(req.url, 'http://localhost').pathname;
          const format = feedFormats.find((format) => format.path === pathname);
          if (!format) return next();
          serveGenerated(req, res, next, format.type, () => readFeeds()[pathname]);
        });
      // Sealed files are served where a build puts them.
      const sealedPrefix = `${base}${assetsDir}/${lockedFilePrefix}`;
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (!pathname.startsWith(sealedPrefix) || (req.method !== 'GET' && req.method !== 'HEAD'))
          return next();
        readSealed().then(({ files }) => {
          const source = files.get(pathname.slice(base.length));
          if (!source) return next();
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(req.method === 'HEAD' ? undefined : source);
        }, next);
      });
      server.watcher.add(articleRoot);
      if (lockedRoot) server.watcher.add(lockedRoot);
      const reload = (file) => {
        if (!ownsFile(file)) return;
        invalidate(file);
        for (const [id, module] of server.moduleGraph.idToModuleMap) {
          if (id === resolvedId || id.startsWith(`${resolvedId}/`))
            server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', reload).on('change', reload).on('unlink', reload);
      server.httpServer?.once('close', () => {
        server.watcher.off('add', reload).off('change', reload).off('unlink', reload);
      });
    },
  };
}
