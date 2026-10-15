import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildArticleCatalog } from './catalog.mjs';
import { articleModule, latestModule, listingModule, searchModule } from './modules.mjs';
import { feedHtml, renderFeeds } from './feeds.mjs';
import { withoutCopies, writePhotoCopy } from './resize.mjs';
import { serveGenerated } from './serve.mjs';
import { feedFormats } from '../../src/config/feeds.mjs';
import { summaryShare, skyDigest } from '../share/spec.mjs';

/** @param {{ directory?: string, moduleId?: string, basePath?: string, feed?: typeof import('../../src/config/feeds.mjs').blogFeed, share?: boolean }} options */
export function articlesPlugin({
  directory = 'content/blog',
  moduleId = 'virtual:articles',
  basePath = '/blog/',
  feed,
  share = false,
} = {}) {
  const resolvedId = `\0${moduleId}`;
  let root;
  let base;
  let assetsDir;
  let articleRoot;
  let publicDir;
  let copyDirectory;
  let shareCards;
  let catalog;
  let feeds;
  let bySlug;
  let assetsByMarker;
  let changedFiles;
  const watched = new Set();
  const compiled = new Map();
  const shownCopies = new Map();
  // Public images that articles show belong to the catalog too: a replaced one gets its new size.
  const ownsFile = (file) =>
    path.resolve(file).startsWith(`${articleRoot}${path.sep}`) || watched.has(path.resolve(file));
  const invalidate = (file) => {
    if (file) changedFiles?.add(path.relative(articleRoot, file).replaceAll('\\', '/'));
    else changedFiles = undefined;
    catalog = undefined;
    feeds = undefined;
    bySlug = undefined;
    assetsByMarker = undefined;
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
      });
      // Static share pages are built by site-share; listing entries carry the same
      // card so a client-rendered route can update its own preview.
      if (share) {
        shareCards ??= {
          publicRoot: path.resolve(root, 'public'),
          sky: skyDigest(path.resolve(root, 'public')),
        };
        for (const article of catalog.articles)
          article.share = summaryShare(article, basePath, shareCards);
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
    return renderFeeds(articles, { ...feed, basePath }, (article, url) =>
      feedHtml(article.html, { url, assetUrl, copies: resized }),
    );
  };
  const sourcePath = (marker) =>
    path.relative(root, assetsByMarker.get(marker)).replaceAll('\\', '/');
  const readFeeds = () => (feeds ??= fullFeeds((marker) => `/${sourcePath(marker)}`));
  // Each copy is made once, when an article first shows it. Where a copy cannot be made
  // or saves too little, the article shows the photo itself.
  const shownArticle = async (article, warn) => {
    const { copies } = readCatalog();
    const filesByMarker = assetsByMarker;
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
    return articleModule({ ...article, html: withoutCopies(article.html, hidden) }, files);
  };
  // Constant-time lookups for per-request consumers such as static share pages.
  const readArticle = (slug) => {
    readCatalog();
    return bySlug.get(slug);
  };

  return {
    name: `local-${directory}`,
    api: { basePath, readCatalog, readArticle },
    configResolved(config) {
      root = config.root;
      base = config.base;
      assetsDir = config.build.assetsDir;
      articleRoot = path.resolve(config.root, directory);
      publicDir = config.publicDir;
      copyDirectory = path.join(config.cacheDir, 'article-images');
    },
    buildStart() {
      invalidate();
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
        return listingModule(catalog, moduleId);
      }
      if (id === `${resolvedId}/search`) return searchModule(catalog);
      if (id === `${resolvedId}/latest`) return latestModule(catalog, basePath);
      const prefix = `${resolvedId}/entry/`;
      if (!id.startsWith(prefix)) return null;
      const article = bySlug.get(decodeURIComponent(id.slice(prefix.length)));
      if (!article) throw new Error(`Unknown article module: ${id.slice(1)}`);
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
    generateBundle(_options, bundle) {
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
      server.watcher.add(articleRoot);
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
