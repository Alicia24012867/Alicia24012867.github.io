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
  LOCK_LEVELS,
  LOCK_MIN_PASSWORD,
  lockedFileName,
  normalizePassword,
  passwordName,
  passwordsFromEnv,
  readLevels,
  sealDocument,
  sealRing,
  veilImages,
} from './locked.mjs';
import { privateName } from './private.mjs';
import { withoutCopies, writePhotoCopy } from './resize.mjs';
import { serveGenerated } from './serve.mjs';
import { feedFormats } from '../../src/config/feeds.mjs';
import { lockedFilePrefix, lockedRingDirectory } from '../../src/config/locked.mjs';
import { sharePath, siteCard, summaryShare, skyDigest } from '../share/spec.mjs';

/**
 * A dev server opens a level whose password is not set with a known one: `preview` for the
 * lowest, then `preview-2` and up. Builds never do.
 */
export const PREVIEW_PASSWORD = 'preview';
export const previewPassword = (level) =>
  level ? `${PREVIEW_PASSWORD}-${level + 1}` : PREVIEW_PASSWORD;

// Blog and Notes share their passwords, so each slow derivation runs once.
const locks = new Map();
function lockWith(password) {
  if (!locks.has(password)) locks.set(password, createLock(password));
  return locks.get(password);
}
// Each collection finds the same missing password; saying so once is enough.
const told = new Set();

/**
 * `directory`, `lockedDirectory` and `lockedLevels` are paths from `sourceRoot`, the Vite root
 * unless given. `reader` is the module that draws a document page, so its static page can fetch
 * it early.
 * `lockedDirectory` holds the collection's locked documents and `lockedLevels` the file that
 * names their levels. Each level's documents ship sealed with its password in
 * `lockedPasswords`, lowest level first; without it a build leaves them out, or fails where
 * `requirePassword`. Where `publicLog`, the build log never shows which locked document has an
 * error, what it says, its photos or its levels.
 * @param {{ sourceRoot?: string, directory?: string, moduleId?: string, basePath?: string, reader?: string, feed?: typeof import('../../src/config/feeds.mjs').blogFeed, share?: boolean, lockedDirectory?: string, lockedLevels?: string, lockedPasswords?: (string | undefined)[], requirePassword?: boolean, publicLog?: boolean }} options
 */
export function articlesPlugin({
  sourceRoot,
  directory = 'content/blog',
  moduleId = 'virtual:articles',
  basePath = '/blog/',
  reader,
  feed,
  share = false,
  lockedDirectory,
  lockedLevels,
  lockedPasswords = passwordsFromEnv(),
  // CI publishes the site, so a missing password there must never drop locked documents.
  requirePassword = !!process.env.CI,
  // Anyone can read CI's build log.
  publicLog = !!process.env.CI,
} = {}) {
  const resolvedId = `\0${moduleId}`;
  let root;
  let documentsRoot;
  let base;
  let assetsDir;
  let articleRoot;
  let lockedRoot;
  let levelsFile;
  let publicDir;
  let copyDirectory;
  let logger;
  let passwords = [];
  let serving = false;
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
      ) ||
      resolved === levelsFile ||
      watched.has(resolved)
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

  // A level's password, or on a dev server a known one in its place.
  const passwordOf = (level) => passwords[level] ?? (serving ? previewPassword(level) : undefined);

  // Without its password, a build leaves a level's documents out rather than publish them open.
  const checkPasswords = ({ levels }) => {
    const all = Array.from({ length: Math.max(1, levels.length) }, (_, level) => level);
    const previews = all.filter((level) => serving && !passwords[level]);
    if (previews.length) {
      const shown = levels.length
        ? previews.map((level) => `${levels[level]} 用 ${previewPassword(level)}`).join('，')
        : PREVIEW_PASSWORD;
      tell(
        `加密文章本地预览密码：${shown}（设置 ${previews.map(passwordName).join('、')} 可改用正式密码）`,
        'info',
      );
    }
    const missing = all.filter(
      (level) =>
        !passwordOf(level) &&
        catalog.articles.some((article) => article.locked && article.level === level),
    );
    if (!missing.length) return;
    const secrets = missing.map(passwordName).join('、');
    // CI logs are public, so only a local build names the levels it leaves out.
    if (requirePassword)
      throw new Error(`构建加密文章需要密码：请在仓库的 Actions secrets 里设置 ${secrets}`);
    const which =
      levels.length && !publicLog
        ? ` ${missing.map((level) => levels[level]).join('、')} 级的`
        : '';
    tell(`未设置 ${secrets}：这次构建不含${which}加密文章`);
    catalog.articles = catalog.articles.filter(
      (article) => !article.locked || !missing.includes(article.level),
    );
  };

  const readCatalog = () => {
    if (!catalog) {
      // Vite calls watchChange before the server's own watcher, so the old files stay
      // owned until the new catalog lists its own.
      watched.clear();
      const levels = levelsFile ? readLevels(levelsFile, named(levelsFile)) : [];
      if (levels.length) watched.add(levelsFile);
      catalog = buildArticleCatalog(articleRoot, (file) => watched.add(file), {
        basePath,
        cache: compiled,
        changedFiles,
        publicDir,
        copyDirectory,
        lockedRoot,
        levels,
        publicLog,
      });
      catalog.levels = levels;
      if (catalog.articles.some((article) => article.locked)) checkPasswords(catalog);
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
  // Files are named in messages as the repository names them.
  const named = (file) => path.relative(documentsRoot, file).replaceAll('\\', '/');
  // Vite names an emitted file from its own root.
  const sourcePath = (marker) =>
    path.relative(root, assetsByMarker.get(marker)).replaceAll('\\', '/');
  // The dev server serves a file in its root at the file's own path, and any other under /@fs/.
  const servedPath = (marker) => {
    const name = sourcePath(marker);
    return name.startsWith('../') || path.isAbsolute(name)
      ? `/@fs/${assetsByMarker.get(marker).replaceAll('\\', '/').replace(/^\//, '')}`
      : `/${name}`;
  };
  const readFeeds = () => (feeds ??= fullFeeds(servedPath));
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
              warn(`Showing ${named(copy.source)} at full size: ${error.message}`);
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
  // read and sealed once for each level that shows it.
  const sealFile = (lock, file) => {
    const stat = fs.statSync(file);
    const version = `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    const key = `${lock.ring}:${file}`;
    let sealed = sealedFiles.get(key);
    if (sealed?.version !== version) {
      const source = lock.seal(fs.readFileSync(file));
      sealed = { version, source, fileName: lockedFileName(assetsDir, source, path.extname(file)) };
      sealedFiles.set(key, sealed);
    }
    return sealed;
  };
  /**
   * Every locked document of a catalog, sealed with its level's key: its photos, their copies
   * and its attachments each in a file of their own, and its text with the addresses of those
   * files in another. Each level's key ring holds the keys of the levels below it; the lowest
   * level's holds none, but tells its password apart from a wrong one. `files` holds each
   * sealed file and ring by its built name, and `bodies` each text's address.
   */
  const sealCatalog = async (current, warn) => {
    const files = new Map();
    const bodies = new Map();
    const locked = current.articles.filter((article) => article.locked);
    if (!locked.length) return { catalog: current, files, bodies };
    const levelLocks = Array.from({ length: Math.max(1, current.levels.length) }, (_, level) => {
      const password = passwordOf(level);
      return password && lockWith(password);
    });
    levelLocks.forEach((lock, level) => {
      if (!lock) return;
      const ring = sealRing(lock, levelLocks.slice(0, level).filter(Boolean));
      files.set(ring.fileName, ring.source);
    });
    const filesByMarker = new Map([...current.assets].map(([file, marker]) => [marker, file]));
    // A public log never names a locked document's photos.
    const photoWarn = publicLog
      ? () => warn('Showing a photo of a locked document at full size')
      : warn;
    for (const article of locked) {
      const lock = levelLocks[article.level];
      const shown = await shownHtml(article, { copies: current.copies, filesByMarker }, photoWarn);
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

  // A file's name in the blog API's bundle comes from its contents, read once until it changes.
  const privateNames = new Map();
  const privateFileName = (file) => {
    const stat = fs.statSync(file);
    const version = `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    let named = privateNames.get(file);
    if (named?.version !== version) {
      named = { version, name: privateName(fs.readFileSync(file), path.extname(file)) };
      privateNames.set(file, named);
    }
    return named.name;
  };
  /**
   * The catalog's documents as the blog API needs them (scripts/content/private.mjs): each one's
   * address, title, date and level, and for a locked one its reading payload, in plain form,
   * whose photos, their copies and attachments are at `filesBase` under names made from their
   * contents. `files` holds the file behind each such name.
   */
  const privateCatalog = async (current, filesBase, warn) => {
    const files = new Map();
    const documents = [];
    const filesByMarker = new Map([...current.assets].map(([file, marker]) => [marker, file]));
    // A public log never names a locked document's photos.
    const photoWarn = publicLog
      ? () => warn('Showing a photo of a locked document at full size')
      : warn;
    for (const article of current.articles) {
      const { slug, title, date, locked, level } = article;
      const entry = { path: sharePath(basePath, slug), title, date, level: locked ? level : null };
      if (locked) {
        const shown = await shownHtml(
          article,
          { copies: current.copies, filesByMarker },
          photoWarn,
        );
        const names = {};
        const html = shown.html.replace(/__ALICIA_ARTICLE_ASSET_\d+__/g, (marker) => {
          const file = shown.files.get(marker);
          if (!file) return marker;
          const name = privateFileName(file);
          files.set(name, file);
          names[filesBase + name] = path.basename(file);
          return filesBase + name;
        });
        entry.payload = lockedPayload(article, html, names);
        entry.files = Object.keys(names).map((url) => url.slice(filesBase.length));
      }
      documents.push(entry);
    }
    return { levels: current.levels, documents, files };
  };
  // Read once per catalog, like the sealed files.
  let privateRead;
  const readPrivate = (filesBase, warn = (message) => logger.warn(message)) => {
    const current = readCatalog();
    if (privateRead?.catalog !== current || privateRead.filesBase !== filesBase)
      privateRead = {
        catalog: current,
        filesBase,
        result: privateCatalog(current, filesBase, warn),
      };
    return privateRead.result;
  };
  // Constant-time lookups for per-request consumers such as static share pages.
  const readArticle = (slug) => {
    readCatalog();
    return bySlug.get(slug);
  };

  return {
    name: `local-${directory}`,
    api: { basePath, moduleId, reader, readCatalog, readArticle, readLocked, readPrivate },
    configResolved(config) {
      root = config.root;
      documentsRoot = path.resolve(config.root, sourceRoot ?? '.');
      base = config.base;
      assetsDir = config.build.assetsDir;
      articleRoot = path.resolve(documentsRoot, directory);
      lockedRoot = lockedDirectory && path.resolve(documentsRoot, lockedDirectory);
      levelsFile = lockedLevels && path.resolve(documentsRoot, lockedLevels);
      publicDir = config.publicDir;
      copyDirectory = path.join(config.cacheDir, 'article-images');
      logger = config.logger;
      passwords = lockedPasswords
        .slice(0, LOCK_LEVELS)
        .map((password) => (password?.trim() ? normalizePassword(password) : undefined));
      passwords.forEach((password, level) => {
        if (!password) return;
        // Sealed files are public: a short password could be guessed offline.
        if ([...password].length < LOCK_MIN_PASSWORD)
          throw new Error(`${passwordName(level)} 至少需要 ${LOCK_MIN_PASSWORD} 个字符`);
        // One password for two levels would open both, and tell neither apart.
        const same = passwords.indexOf(password);
        if (same < level)
          throw new Error(
            `${passwordName(level)} 与 ${passwordName(same)} 相同：每一级需要不同的密码`,
          );
      });
      // Local previews need no secret; they open each level with a known password.
      serving = config.command === 'serve';
    },
    buildStart() {
      invalidate();
      // A build without a password it needs stops here, before any module asks again.
      if (!serving && lockedRoot && requirePassword) readCatalog();
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
      // Sealed files and key rings are served where a build puts them.
      const sealedPrefixes = [
        `${base}${assetsDir}/${lockedFilePrefix}`,
        `${base}${lockedRingDirectory}/`,
      ];
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (
          !sealedPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
          (req.method !== 'GET' && req.method !== 'HEAD')
        )
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
      if (levelsFile) server.watcher.add(levelsFile);
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
