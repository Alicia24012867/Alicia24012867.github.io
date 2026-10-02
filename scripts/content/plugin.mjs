import path from 'node:path';
import { buildArticleCatalog } from './catalog.mjs';
import { articleModule, listingModule, searchModule } from './modules.mjs';
import { renderFeeds } from './feeds.mjs';
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
  let articleRoot;
  let shareCards;
  let catalog;
  let feeds;
  let bySlug;
  let assetsByMarker;
  let changedFiles;
  const watched = new Set();
  const compiled = new Map();
  const ownsFile = (file) => path.resolve(file).startsWith(`${articleRoot}${path.sep}`);
  const invalidate = (file) => {
    if (file) changedFiles?.add(path.relative(articleRoot, file).replaceAll('\\', '/'));
    else changedFiles = undefined;
    catalog = undefined;
    feeds = undefined;
    bySlug = undefined;
    assetsByMarker = undefined;
    watched.clear();
  };

  const readCatalog = () => {
    if (!catalog) {
      catalog = buildArticleCatalog(articleRoot, (file) => watched.add(file), {
        basePath,
        cache: compiled,
        changedFiles,
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
  const readFeeds = () => (feeds ??= renderFeeds(readCatalog().articles, { ...feed, basePath }));

  return {
    name: `local-${directory}`,
    api: { basePath, readCatalog },
    configResolved(config) {
      root = config.root;
      articleRoot = path.resolve(config.root, directory);
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
    load(id) {
      if (id !== resolvedId && !id.startsWith(`${resolvedId}/`)) return null;
      readCatalog();
      if (id === resolvedId) {
        for (const file of watched) this.addWatchFile(file);
        return listingModule(catalog, moduleId);
      }
      if (id === `${resolvedId}/search`) return searchModule(catalog);
      const prefix = `${resolvedId}/entry/`;
      if (!id.startsWith(prefix)) return null;
      const article = bySlug.get(decodeURIComponent(id.slice(prefix.length)));
      if (!article) throw new Error(`Unknown article module: ${id.slice(1)}`);
      return articleModule(article, assetsByMarker);
    },
    transformIndexHtml() {
      if (!feed) return;
      return feedFormats.map(({ path, type, label }) => ({
        tag: 'link',
        attrs: { rel: 'alternate', type, title: `${feed.title} · ${label}`, href: path },
        injectTo: 'head',
      }));
    },
    generateBundle() {
      if (!feed) return;
      for (const [pathname, source] of Object.entries(readFeeds()))
        this.emitFile({ type: 'asset', fileName: pathname.slice(1), source });
      for (const file of watched) this.addWatchFile(file);
    },
    configureServer(server) {
      if (feed)
        server.middlewares.use((req, res, next) => {
          const pathname = new URL(req.url, 'http://localhost').pathname;
          const format = feedFormats.find((format) => format.path === pathname);
          if (!format) return next();
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.statusCode = 405;
            res.setHeader('Allow', 'GET, HEAD');
            return res.end();
          }
          try {
            const body = req.method === 'HEAD' ? undefined : readFeeds()[pathname];
            res.setHeader('Content-Type', `${format.type}; charset=utf-8`);
            res.setHeader('Cache-Control', 'no-cache');
            res.end(body);
          } catch (error) {
            next(error);
          }
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
