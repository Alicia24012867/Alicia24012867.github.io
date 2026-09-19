import path from 'node:path';
import { buildArticleCatalog, catalogModule } from './articles/catalog.mjs';

const moduleId = 'virtual:articles';
const resolvedId = `\0${moduleId}`;

export function articlesPlugin() {
  let articleRoot;
  return {
    name: 'local-articles',
    configResolved(config) { articleRoot = path.resolve(config.root, 'articles'); },
    resolveId(id) { return id === moduleId ? resolvedId : null; },
    load(id) {
      if (id !== resolvedId) return null;
      return catalogModule(buildArticleCatalog(articleRoot, (file) => this.addWatchFile(file)));
    },
    configureServer(server) {
      server.watcher.add(articleRoot);
      const reload = (file) => {
        if (!path.resolve(file).startsWith(`${articleRoot}${path.sep}`)) return;
        const module = server.moduleGraph.getModuleById(resolvedId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', reload).on('change', reload).on('unlink', reload);
      server.httpServer?.once('close', () => {
        server.watcher.off('add', reload).off('change', reload).off('unlink', reload);
      });
    },
  };
}
