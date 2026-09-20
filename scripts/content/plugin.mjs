import path from 'node:path';
import { buildArticleCatalog } from './catalog.mjs';
import { articleModule, listingModule, searchModule } from './modules.mjs';

export function articlesPlugin({
  directory = 'content/blog',
  moduleId = 'virtual:articles',
  basePath = '/blog/',
} = {}) {
  const resolvedId = `\0${moduleId}`;
  let articleRoot;
  let catalog;
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
    bySlug = undefined;
    assetsByMarker = undefined;
    watched.clear();
  };

  return {
    name: `local-${directory}`,
    configResolved(config) {
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
      if (!catalog) {
        catalog = buildArticleCatalog(articleRoot, (file) => watched.add(file), {
          basePath,
          cache: compiled,
          changedFiles,
        });
        changedFiles = new Set();
        bySlug = new Map(catalog.articles.map((article) => [article.slug, article]));
        assetsByMarker = new Map([...catalog.assets].map(([file, marker]) => [marker, file]));
      }
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
    configureServer(server) {
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
