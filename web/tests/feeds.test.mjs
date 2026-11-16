import test from 'node:test';
import assert from 'node:assert/strict';
import {
  realpathSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { build, createServer, preview } from 'vite';
import { buildArticleCatalog } from '../scripts/content/catalog.mjs';
import { feedHtml, renderFeeds } from '../scripts/content/feeds.mjs';
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

// A grainy photo, large enough to get a resized copy on the site.
const photo = (file, width, height) =>
  sharp({
    create: { width, height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 30 } },
  })
    .jpeg({ quality: 95 })
    .toFile(file);

test('feed entries carry the whole post as plain HTML with full addresses', async (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'alicia-feed-html-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const blog = path.join(root, 'content/blog');
  mkdirSync(path.join(blog, 'assets'), { recursive: true });
  mkdirSync(path.join(root, 'public/images'), { recursive: true });
  await photo(path.join(blog, 'assets/photo.jpg'), 4000, 3000);
  await photo(path.join(root, 'public/images/sky.jpg'), 300, 200);
  writeFileSync(path.join(blog, 'assets/notes.pdf'), '%PDF-1.4 fixture');
  writeFileSync(
    path.join(blog, 'post.md'),
    [
      '---\ndate: 2026-01-01\n---',
      'See [the other post](./other.md), [its end](./other.md#end), [a note](#notes) and [notes](./assets/notes.pdf).[^1]',
      '![A photo](./assets/photo.jpg)',
      '![The sky](/images/sky.jpg)',
      'Inline $a^2$ and a display formula:',
      '$$\nE=mc^2\n$$',
      '```js\nconst answer = 42;\n```',
      '```mermaid\nflowchart TD\nA-->B\n```',
      '<figure data-figure="timestep-control"></figure>',
      '| a | b |\n|---|---|\n| 1 | 2 |',
      '- [x] done\n- [ ] todo',
      '[^1]: A footnote.',
    ].join('\n\n'),
  );
  writeFileSync(path.join(blog, 'other.md'), '---\ndate: 2026-01-02\n---\n\nAnother post.');
  writeFileSync(
    path.join(blog, 'zh.md'),
    '---\ndate: 2026-01-03\n---\n\n今天天气很好，我们一起去公园散步，看见了很多花。\n\n```js\nlet a = 1;\n```',
  );
  const catalog = buildArticleCatalog(blog, () => {}, {
    publicDir: path.join(root, 'public'),
    copyDirectory: path.join(root, 'copies'),
  });
  const files = new Map([...catalog.assets].map(([file, marker]) => [marker, file]));
  const resized = new Set(
    [...catalog.copies.values()].map((copy) => catalog.assets.get(copy.file)),
  );
  assert.equal(resized.size, 1);
  const assetUrl = (marker) => `/assets/${path.basename(files.get(marker))}`;
  const contentOf = (article, url) => feedHtml(article.html, { url, assetUrl, copies: resized });
  const post = catalog.articles.find((article) => article.slug === 'post');
  const html = contentOf(post, 'https://example.com/blog/post/');

  // Photos load at full size, from addresses that work outside the site.
  assert.match(
    html,
    /<img src="https:\/\/example.com\/assets\/photo.jpg" alt="A photo" [^>]*width="4000" height="3000" \/>/,
  );
  assert.match(html, /<img src="https:\/\/example.com\/images\/sky.jpg"/);
  assert.doesNotMatch(html, /srcset|sizes=|data-full-src|--ratio|__ALICIA_ARTICLE_ASSET_/);
  assert.match(html, /href="https:\/\/example.com\/blog\/other\/"/);
  assert.match(html, /href="https:\/\/example.com\/blog\/other\/#end"/);
  assert.match(html, /href="https:\/\/example.com\/assets\/notes.pdf"/);
  // Links within the entry, such as footnotes, stay within it.
  assert.match(html, /href="#notes"/);
  assert.match(html, /<a href="#fn-1"/);
  // Formulas keep only their MathML; the spans KaTeX's stylesheet lays out are gone.
  assert.match(html, /Inline <math xmlns="http:\/\/www.w3.org\/1998\/Math\/MathML">/);
  assert.match(html, /<div class="article-math"><math xmlns="[^"]+" display="block">/);
  assert.doesNotMatch(html, /katex/);
  assert.match(html, /<pre><code class="hljs">/);
  assert.doesNotMatch(html, /<button|copy-code|tabindex|role="region"|<input/);
  assert.match(html, /<table>/);
  assert.match(html, /☑ done[\s\S]*☐ todo/);
  // The site draws diagrams and interactive figures with scripts, so readers get the post.
  assert.equal(html.match(/<a href="https:\/\/example.com\/blog\/post\/">/g).length, 2);
  assert.doesNotMatch(html, /mermaid|flowchart|data-figure/);

  const zh = contentOf(
    catalog.articles.find((article) => article.slug === 'zh'),
    'https://example.com/blog/zh/',
  );
  // Code keeps its English typesetting inside Chinese writing.
  assert.match(zh, /<pre lang="en"><code class="hljs">/);

  const feeds = renderFeeds(catalog.articles, config, contentOf);
  const rss = feeds['/rss.xml'];
  const atom = feeds['/atom.xml'];
  assert.match(rss, /xmlns:content="http:\/\/purl.org\/rss\/1.0\/modules\/content\/"/);
  assert.equal(rss.match(/<content:encoded>/g).length, 3);
  assert.equal(atom.match(/<content type="html">/g).length, 3);
  assert.ok(rss.includes(xmlText(html)));
  assert.ok(atom.includes(xmlText(html)));
  // Only the Chinese entry names its language, which differs from the feed's.
  assert.equal(atom.match(/<entry xml:lang="zh-CN">/g).length, 1);
  assert.equal(atom.match(/<entry>/g).length, 2);
  assert.ok(
    atom.includes(`<content type="html">${xmlText(`<div lang="zh-CN">${zh}</div>`)}</content>`),
  );
  assert.ok(
    rss.includes(`<content:encoded>${xmlText(`<div lang="zh-CN">${zh}</div>`)}</content:encoded>`),
  );
});

const xmlText = (text) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character],
  );

test('built feeds name the files the build wrote, including ones Vite inlines into pages', async (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'alicia-feed-files-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const blog = path.join(root, 'content/blog');
  mkdirSync(path.join(blog, 'assets'), { recursive: true });
  for (const directory of ['blog', 'notes']) mkdirSync(path.join(root, directory));
  const pages = ['index.html', 'blog/index.html', 'notes/index.html', '404.html'];
  for (const file of pages)
    writeFileSync(
      path.join(root, file),
      '<html><head><title>Fixture</title></head><body></body></html>',
    );
  // Like the reader, the Blog page loads the article, so the build writes its attachments.
  writeFileSync(
    path.join(root, 'blog/index.html'),
    '<html><head><title>Fixture</title></head><body><script type="module" src="./main.js"></script></body></html>',
  );
  writeFileSync(
    path.join(root, 'blog/main.js'),
    "import { loadArticle } from 'virtual:articles';\nloadArticle('post');\n",
  );
  await photo(path.join(blog, 'assets/photo.jpg'), 4000, 3000);
  // Small enough for Vite to write into the article's script instead of a file.
  await sharp({ create: { width: 4, height: 4, channels: 3, background: '#3a8de0' } })
    .png()
    .toFile(path.join(blog, 'assets/dot.png'));
  writeFileSync(
    path.join(blog, 'post.md'),
    '---\ndate: 2026-01-01\n---\n\n![A photo](./assets/photo.jpg)\n\n![A dot](./assets/dot.png)',
  );
  await build({
    root,
    configFile: false,
    appType: 'mpa',
    logLevel: 'silent',
    cacheDir: path.join(root, 'cache'),
    plugins: [notFoundPlugin(), articlesPlugin({ feed: config })],
    build: { rolldownOptions: { input: pages.map((file) => path.join(root, file)) } },
  });
  const atom = readFileSync(path.join(root, 'dist/atom.xml'), 'utf8');
  const images = [...atom.matchAll(/&lt;img src=&quot;https:\/\/example.com\/([^&]+)&quot;/g)].map(
    ([, file]) => file,
  );
  assert.equal(images.length, 2);
  assert.match(images[1], /^assets\/dot-[0-9a-f]{8}\.png$/);
  for (const file of images)
    assert.deepEqual(
      readFileSync(path.join(root, 'dist', file)),
      readFileSync(
        path.join(blog, 'assets', file.replace(/^assets\/(\w+)-[\w-]+(\.\w+)$/, '$1$2')),
      ),
    );
  // The page shows a resized copy of the photo and offers the same full-size file as the feed;
  // the dot is written into the page.
  const scripts = readdirSync(path.join(root, 'dist/assets')).filter((file) =>
    file.endsWith('.js'),
  );
  const article = scripts
    .map((file) => readFileSync(path.join(root, 'dist/assets', file), 'utf8'))
    .join('\n');
  const urls = Object.fromEntries(
    [...article.matchAll(/(__ALICIA_ARTICLE_ASSET_\d+__):`([^`]*)`/g)].map(([, marker, url]) => [
      marker,
      url,
    ]),
  );
  const [, copy, original] = /srcset="(\w+) 1724w, (\w+) 4000w"/.exec(article);
  assert.equal(urls[original], `/${images[0]}`);
  assert.match(urls[copy], /^\/assets\/photo-[\w-]+\.jpg$/);
  assert.notEqual(urls[copy], urls[original]);
  assert.match(Object.values(urls).join(' '), /data:image\/png;base64,/);
});
