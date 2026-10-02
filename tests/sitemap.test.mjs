import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, createServer, preview } from 'vite';
import { articlesPlugin } from '../scripts/content/plugin.mjs';
import { notFoundPlugin } from '../scripts/not-found.mjs';
import { renderSitemap, renderRobots, sitemapPlugin } from '../scripts/content/sitemap.mjs';

const siteUrl = 'https://example.com/';
test('sitemap contains canonical pages and escaped article URLs with real modification dates', () => {
  const collections = [
    {
      basePath: '/blog/',
      articles: [{ slug: "中文/a&'b", date: '2026-01-01', updated: '2026-02-01T12:00:00+08:00' }],
    },
    { basePath: '/notes/', articles: [{ slug: 'note', date: '2026-01-02', updated: '' }] },
  ];
  const sitemap = renderSitemap(collections, siteUrl);
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 5);
  assert.ok(
    sitemap.includes(
      `<loc>https://example.com/blog/?post=${encodeURIComponent("中文/a&'b").replaceAll("'", '%27')}</loc>`,
    ),
  );
  assert.match(sitemap, /<lastmod>2026-02-01T04:00:00.000Z<\/lastmod>/);
  assert.match(sitemap, /<lastmod>2026-01-02T00:00:00.000Z<\/lastmod>/);
  assert.doesNotMatch(sitemap, /404|q=|sort=|<priority>|<changefreq>/);
  assert.equal(sitemap, renderSitemap(collections, siteUrl));
  assert.equal(
    renderRobots(siteUrl),
    'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n',
  );
});

test('empty collections retain landing pages without inventing modification dates', () => {
  const sitemap = renderSitemap(
    [
      { basePath: '/blog/', articles: [] },
      { basePath: '/notes/', articles: [] },
    ],
    siteUrl,
  );
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 3);
  assert.doesNotMatch(sitemap, /lastmod|post=/);
});

for (const mode of ['development', 'preview']) {
  test(`${mode} serves sitemap and robots from the published Blog and Notes catalogs`, async (t) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'alicia-sitemap-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const directory of ['content/blog', 'content/notes'])
      mkdirSync(path.join(root, directory), { recursive: true });
    writeFileSync(path.join(root, 'index.html'), '<html><head></head><body>Home</body></html>');
    writeFileSync(path.join(root, '404.html'), '<html><body>Missing</body></html>');
    const post = path.join(root, 'content/blog/post.md');
    const note = path.join(root, 'content/notes/note.md');
    writeFileSync(post, '---\ndate: 2026-01-01\n---\n# Post');
    writeFileSync(note, '---\ndate: 2026-01-02\n---\n# Note');
    writeFileSync(path.join(root, 'content/blog/draft.md'), '---\ndraft: true\n---\n# Draft');
    const blog = articlesPlugin();
    const notes = articlesPlugin({
      directory: 'content/notes',
      moduleId: 'virtual:notes',
      basePath: '/notes/',
    });
    const options = {
      root,
      configFile: false,
      appType: 'mpa',
      logLevel: 'silent',
      plugins: [notFoundPlugin(), blog, notes, sitemapPlugin([blog.api, notes.api], siteUrl)],
    };
    let server;
    if (mode === 'development') {
      server = await createServer({
        ...options,
        server: { host: '127.0.0.1', port: 0, hmr: false, ws: false, watch: null },
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      await server.listen();
      t.after(() => server.close());
    } else {
      await build(options);
      server = await preview({ ...options, preview: { host: '127.0.0.1', port: 0 } });
      t.after(() => new Promise((resolve) => server.httpServer.close(resolve)));
    }
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const response = await fetch(origin + '/sitemap.xml');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /xml/);
    const sitemap = await response.text();
    assert.match(sitemap, /https:\/\/example.com\/blog\/\?post=post/);
    assert.match(sitemap, /https:\/\/example.com\/notes\/\?post=note/);
    assert.doesNotMatch(sitemap, /draft|404|localhost/);
    const robots = await fetch(origin + '/robots.txt');
    assert.equal(robots.status, 200);
    assert.match(robots.headers.get('content-type'), /text\/plain/);
    assert.equal(await robots.text(), renderRobots(siteUrl));
    for (const file of ['/sitemap.xml', '/robots.txt']) {
      const head = await fetch(origin + file, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
    }
    if (mode === 'development') {
      writeFileSync(note, '---\ndate: 2026-01-02\nupdated: 2026-02-01\n---\n# Revised');
      server.watcher.emit('change', note);
      assert.match(await (await fetch(origin + '/sitemap.xml')).text(), /2026-02-01T00:00:00.000Z/);
      rmSync(post);
      server.watcher.emit('unlink', post);
      assert.doesNotMatch(await (await fetch(origin + '/sitemap.xml')).text(), /post=post/);
    }
  });
}
