import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

// GitHub Pages serves dist/404.html automatically. Match that behavior locally.
export function notFoundPlugin() {
  function middleware(root, transform = (html) => html) {
    const file = path.join(root, '404.html');
    let cached;
    async function loadHtml() {
      // A single cached promise also shares work across concurrent requests.
      // Recheck metadata so edits and preview rebuilds do not serve stale HTML.
      const { mtimeMs, ctimeMs, size } = await fs.stat(file);
      const version = `${mtimeMs}:${ctimeMs}:${size}`;
      if (cached?.version !== version) {
        const entry = { version, html: fs.readFile(file, 'utf8').then(transform) };
        cached = entry;
        entry.html.catch(() => {
          if (cached === entry) cached = undefined;
        });
      }
      return cached.html;
    }
    return async (req, res, next) => {
      const accept = req.headers.accept;
      if (
        (req.method !== 'GET' && req.method !== 'HEAD') ||
        (accept && !accept.includes('text/html') && !accept.includes('*/*'))
      )
        return next();

      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      } catch {
        return next();
      }
      // Vite has already resolved directory indexes and extensionless HTML URLs.
      // Leave existing HTML files to its HTML middleware, which runs after this hook.
      if (pathname.endsWith('.html') && existsSync(path.join(root, pathname))) return next();

      try {
        const html = req.method === 'HEAD' ? undefined : await loadHtml();
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(html);
      } catch (error) {
        next(error);
      }
    };
  }

  return {
    name: 'site-not-found',
    configureServer(server) {
      return () => {
        server.middlewares.use(
          middleware(server.config.root, (html) => server.transformIndexHtml('/404.html', html)),
        );
      };
    },
    configurePreviewServer(server) {
      return () => {
        server.middlewares.use(
          middleware(path.resolve(server.config.root, server.config.build.outDir)),
        );
      };
    },
  };
}
