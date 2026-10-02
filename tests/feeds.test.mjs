import test from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, createServer, preview } from 'vite';
import { renderFeeds } from '../scripts/content/feeds.mjs';
import { articlesPlugin } from '../scripts/content/plugin.mjs';
import { notFoundPlugin } from '../scripts/not-found.mjs';
import { blogFeed, feedFormats } from '../src/config/feeds.mjs';
import { sharePath } from '../src/config/sharing.mjs';

const article = {
  slug: 'nested/中文 & API',
  title: 'A < B & "C"',
  description: 'Text <strong>not markup</strong> & a ]]> boundary.\u0001😀',
  author: 'A & B',
  tags: ['C++', '"quoted" & <tag>'],
  date: '2026-01-02',
  updated: '2026-02-03T12:00:00+08:00',
};
const config = { ...blogFeed, siteUrl: 'https://example.com/', idBaseUrl: undefined };

test('moving the public domain preserves feed and entry identities', () => {
  const before = renderFeeds([article], { ...blogFeed, siteUrl: blogFeed.idBaseUrl });
  const after = renderFeeds([article], blogFeed);
  for (const format of ['/rss.xml', '/atom.xml']) {
    const identities = (xml) =>
      [...xml.matchAll(/<(?:id|guid)[^>]*>([^<]+)<\/(?:id|guid)>/g)].map((match) => match[1]);
    assert.deepEqual(identities(after[format]), identities(before[format]));
    assert.ok(
      after[format].includes(
        new URL(sharePath('/blog/', article.slug), 'https://nymphilia.com/').href,
      ),
    );
  }
});

test('feeds escape XML, keep summaries inert, and link to static article addresses', () => {
  const feeds = renderFeeds([article], config);
  const url = new URL(sharePath('/blog/', article.slug), 'https://example.com/').href;
  const id = `https://example.com/blog/?post=${encodeURIComponent(article.slug)}`;
  const rss = feeds['/rss.xml'];
  const atom = feeds['/atom.xml'];
  for (const source of Object.values(feeds)) {
    assert.ok(source.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(source.includes(url));
    assert.ok(source.includes(id));
    assert.match(source, /A &lt; B &amp; &quot;C&quot;/);
    assert.match(source, /A &amp; B/);
    assert.match(source, /😀/);
    assert.doesNotMatch(source, /\u0001|<strong>|<!\[CDATA\[/);
  }
  assert.match(rss, /&amp;lt;strong&amp;gt;not markup&amp;lt;\/strong&amp;gt;/);
  assert.match(atom, /<summary type="text">Text &lt;strong&gt;not markup&lt;\/strong&gt;/);
  assert.match(rss, /<link>https:\/\/example.com\/blog\/nested\//);
  assert.match(rss, /<guid isPermaLink="false">https:\/\/example.com\/blog\/\?post=/);
  assert.match(atom, /<published>2026-01-02T00:00:00.000Z<\/published>/);
  assert.match(atom, /<updated>2026-02-03T04:00:00.000Z<\/updated>/);
  assert.match(rss, /<pubDate>Fri, 02 Jan 2026 00:00:00 GMT<\/pubDate>/);
  assert.match(rss, /<lastBuildDate>Tue, 03 Feb 2026 04:00:00 GMT<\/lastBuildDate>/);
  assert.match(atom, /<category term="&quot;quoted&quot; &amp; &lt;tag&gt;"\/>/);
});

test('feeds order by publication instant, ignore pins, and retain IDs across edits', () => {
  const entries = [
    { ...article, slug: 'old', date: '2026-01-01', pin: true },
    { ...article, slug: 'a', date: '2026-01-02T07:00:00Z' },
    { ...article, slug: 'new', date: '2026-01-03' },
    { ...article, slug: 'b', date: '2026-01-01T23:00:00-08:00' },
  ];
  const feeds = renderFeeds(entries, config);
  assert.deepEqual(
    entries.map(({ slug }) => slug),
    ['old', 'a', 'new', 'b'],
  );
  assert.deepEqual(
    [...feeds['/rss.xml'].matchAll(/<guid[^>]*>[^<]*\?post=([^<]+)<\/guid>/g)].map((m) => m[1]),
    ['new', 'a', 'b', 'old'],
  );
  const revised = renderFeeds(
    entries.map((entry) => ({ ...entry, title: 'Changed', updated: '2026-03-01' })),
    config,
  );
  assert.deepEqual(
    [...revised['/atom.xml'].matchAll(/<id>([^<]+)<\/id>/g)].map((m) => m[1]),
    [...feeds['/atom.xml'].matchAll(/<id>([^<]+)<\/id>/g)].map((m) => m[1]),
  );
});

test('empty feeds are deterministic, include discovery metadata, and have a fallback author', () => {
  const feeds = renderFeeds([], config);
  assert.deepEqual(feeds, renderFeeds([], config));
  assert.doesNotMatch(feeds['/rss.xml'], /<item>/);
  assert.doesNotMatch(feeds['/atom.xml'], /<entry>/);
  assert.match(feeds['/atom.xml'], /<updated>1970-01-01T00:00:00.000Z<\/updated>/);
  for (const { path: pathname, type } of feedFormats)
    assert.ok(
      feeds[pathname].includes(`href="https://example.com${pathname}" rel="self" type="${type}"`),
    );
  assert.match(
    renderFeeds([{ ...article, author: '' }], config)['/atom.xml'],
    /<author><name>Alicia<\/name><\/author>/,
  );
  for (const siteUrl of ['relative', 'file:///tmp/', 'https://user:password@example.com/'])
    assert.throws(() => renderFeeds([], { ...config, siteUrl }));
});

for (const mode of ['development', 'preview']) {
  test(`${mode} serves discoverable Blog feeds and excludes drafts and Notes`, async (t) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'alicia-feeds-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const directory of ['blog', 'notes', 'content/blog', 'content/notes'])
      mkdirSync(path.join(root, directory), { recursive: true });
    const pages = ['index.html', 'blog/index.html', 'notes/index.html', '404.html'];
    for (const file of pages)
      writeFileSync(
        path.join(root, file),
        '<html><head><title>Fixture</title></head><body>Page</body></html>',
      );
    const published = path.join(root, 'content/blog/post.md');
    writeFileSync(
      published,
      '---\ndate: 2026-01-01\nauthor: Alicia\n---\n# Published\n\nVisible summary.',
    );
    writeFileSync(
      path.join(root, 'content/blog/draft.md'),
      '---\ndraft: true\n---\n# Secret draft',
    );
    writeFileSync(path.join(root, 'content/notes/note.md'), '# Note exclusive');
    const options = {
      root,
      configFile: false,
      appType: 'mpa',
      logLevel: 'silent',
      plugins: [notFoundPlugin(), articlesPlugin({ feed: config })],
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
      await build({
        ...options,
        build: { rolldownOptions: { input: pages.map((file) => path.join(root, file)) } },
      });
      server = await preview({ ...options, preview: { host: '127.0.0.1', port: 0 } });
      t.after(() => new Promise((resolve) => server.httpServer.close(resolve)));
    }
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    for (const { path: pathname, type } of feedFormats) {
      const response = await fetch(`${origin}${pathname}?reader=test`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /xml/);
      if (mode === 'development') assert.ok(response.headers.get('content-type').startsWith(type));
      const xml = await response.text();
      assert.match(xml, /Published/);
      assert.match(xml, /https:\/\/example.com\/blog\/post\//);
      assert.match(xml, /https:\/\/example.com\/blog\/\?post=post/);
      assert.doesNotMatch(xml, /Secret draft|Note exclusive|localhost/);
      if (mode === 'preview')
        assert.equal(xml, readFileSync(path.join(root, 'dist', pathname), 'utf8'));
      const head = await fetch(origin + pathname, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
    }
    for (const page of ['/', '/blog/', '/notes/', '/404.html']) {
      const html = await (await fetch(origin + page)).text();
      for (const { path: pathname, type } of feedFormats) {
        assert.ok(html.includes(`type="${type}"`));
        assert.ok(html.includes(`href="${pathname}"`));
      }
    }
    if (mode === 'development') {
      writeFileSync(published, '---\ndate: 2026-01-01\n---\n# Revised\n\nChanged summary.');
      server.watcher.emit('change', published);
      assert.match(await (await fetch(origin + '/rss.xml')).text(), /Revised/);
      rmSync(published);
      server.watcher.emit('unlink', published);
      assert.doesNotMatch(await (await fetch(origin + '/atom.xml')).text(), /<entry>/);
      writeFileSync(published, '---\ndate: 2026-01-02\n---\n# Recreated');
      server.watcher.emit('add', published);
      assert.match(await (await fetch(origin + '/rss.xml')).text(), /Recreated/);
      assert.equal((await fetch(origin + '/rss.xml', { method: 'POST' })).status, 405);
    }
  });
}
