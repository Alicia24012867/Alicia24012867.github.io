import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, createServer, preview } from 'vite';
import { notFoundPlugin } from '../scripts/not-found.mjs';

for (const mode of ['development', 'preview']) {
  test(`${mode} serves unknown paths with the custom 404 and preserves real pages`, async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), 'alicia-404-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const directory of ['blog', 'notes', 'public/images'])
      mkdirSync(path.join(root, directory), { recursive: true });
    for (const file of ['index.html', 'blog/index.html', 'notes/index.html'])
      writeFileSync(path.join(root, file), `<html><head></head><body>${file}</body></html>`);
    writeFileSync(
      path.join(root, 'public/images/sky.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    writeFileSync(
      path.join(root, '404.html'),
      '<html><head><title>Page not found</title></head><body><h1>404</h1><img src="%BASE_URL%images/sky.svg"><a href="/">Home</a><a href="/blog/">Blog</a><a href="/notes/">Notes</a></body></html>',
    );
    const config = {
      root,
      configFile: false,
      appType: 'mpa',
      base: '/',
      logLevel: 'silent',
      plugins: [notFoundPlugin()],
    };
    let httpServer;
    if (mode === 'development') {
      const server = await createServer({
        ...config,
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      t.after(() => server.close());
      httpServer = createHttpServer(server.middlewares);
      await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    } else {
      await build({
        ...config,
        build: {
          rolldownOptions: {
            input: ['index.html', 'blog/index.html', 'notes/index.html', '404.html'].map((file) =>
              path.join(root, file),
            ),
          },
        },
      });
      const server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
      httpServer = server.httpServer;
    }
    t.after(() => new Promise((resolve) => httpServer.close(resolve)));
    const origin = `http://127.0.0.1:${httpServer.address().port}`;
    for (const pathname of [
      '/typo',
      '/missing/',
      '/blog/missing',
      '/notes/deep/missing/?post=example&q=GPU',
      '/nested/missing.html',
      '/%E4%B8%8D%E5%AD%98%E5%9C%A8/',
    ]) {
      const response = await fetch(origin + pathname, { headers: { Accept: 'text/html' } });
      assert.equal(response.status, 404, pathname);
      assert.equal(response.redirected, false, pathname);
      assert.match(response.headers.get('content-type'), /text\/html/);
      const html = await response.text();
      assert.match(html, /<h1>404<\/h1>/);
      assert.match(html, /src="\/images\/sky.svg"/);
      for (const target of ['/', '/blog/', '/notes/']) assert.ok(html.includes(`href="${target}"`));
    }
    for (const pathname of ['/', '/blog/', '/notes/', '/notes/?post=missing', '/404.html']) {
      const response = await fetch(origin + pathname);
      assert.equal(response.status, 200, pathname);
      assert.match(await response.text(), /<html>/);
    }
    const asset = await fetch(`${origin}/images/sky.svg`);
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /<svg/);
    const head = await fetch(`${origin}/missing/deep/`, { method: 'HEAD' });
    assert.equal(head.status, 404);
    assert.equal(await head.text(), '');
    const data = await fetch(`${origin}/missing.json`, { headers: { Accept: 'application/json' } });
    assert.equal(data.status, 404);
    assert.doesNotMatch(await data.text(), /<h1>404/);
    const post = await fetch(`${origin}/missing/`, { method: 'POST' });
    assert.equal(post.status, 404);
    assert.doesNotMatch(await post.text(), /<h1>404/);
  });
}
