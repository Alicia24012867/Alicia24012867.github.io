import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// GitHub Pages serves dist/404.html automatically. Match that behavior locally.
export function notFoundPlugin() {
  function middleware(root, transform = async (html) => html) {
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
        const html = await transform(await readFile(path.join(root, '404.html'), 'utf8'));
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(req.method === 'HEAD' ? undefined : html);
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
