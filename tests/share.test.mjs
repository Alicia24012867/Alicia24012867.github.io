import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, createServer, preview } from 'vite';
import { buildArticleCatalog } from '../scripts/content/catalog.mjs';
import { articlesPlugin } from '../scripts/content/plugin.mjs';
import { sharePageHtml, sharePlugin } from '../scripts/content/share.mjs';
import { notFoundPlugin } from '../scripts/not-found.mjs';
import {
  articleCard,
  cardCollections,
  requireCard,
  requireSiteCard,
  siteCard,
} from '../scripts/share/spec.mjs';

const siteUrl = 'https://example.com/';
const repo = path.resolve(import.meta.dirname, '..');

const head = [
  '<meta name="description" content="Listing" />',
  '<meta property="og:title" content="Blog · Alicia" />',
  '<meta property="og:description" content="Listing" />',
  '<meta property="og:type" content="website" />',
  '<link rel="canonical" href="https://example.com/blog/" />',
  '<meta property="og:url" content="https://example.com/blog/" />',
  '<meta property="og:image" content="https://example.com/images/share/site.aaa.jpg" />',
  '<meta property="og:image:alt" content="Alicia" />',
  '<meta name="twitter:title" content="Blog · Alicia" />',
  '<meta name="twitter:description" content="Listing" />',
  '<meta name="twitter:image" content="https://example.com/images/share/site.aaa.jpg" />',
  '<meta name="twitter:image:alt" content="Alicia" />',
].join('\n    ');
const shell =
  '<!doctype html>\n<html lang="en">\n  <head>\n    ' +
  head +
  '\n    <title>Blog · Alicia</title>\n  </head>\n  <body>\n    <div id="root"></div>\n' +
  '    <noscript>Please enable JavaScript to read the blog.</noscript>\n' +
  '    <script type="module" src="/assets/blog.js"></script>\n  </body>\n</html>\n';

const article = {
  slug: 'nested/中文 note',
  title: 'A < B & "C"',
  description: 'Summary & more',
  author: 'Alicia',
  tags: ['life', '中文'],
  date: '2026-01-02',
  updated: '2026-02-03T12:00:00+08:00',
  section: 'life',
};
const card = { url: '/images/share/blog/nested/中文 note.abc123.jpg' };

/** JPEG start-of-frame dimensions, read without an image library. */
function jpegSize(buffer) {
  assert.equal(buffer.readUInt16BE(0), 0xffd8, 'not a JPEG file');
  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  return undefined;
}

test('a static share page rewrites the entry head for one article', () => {
  const html = sharePageHtml(shell, article, { siteUrl, basePath: '/blog/', card });
  const canonical = new URL('/blog/nested/%E4%B8%AD%E6%96%87%20note/', siteUrl).href;
  const image = new URL(card.url, siteUrl).href;
  assert.match(html, /<title>A &lt; B &amp; &quot;C&quot; · Alicia Blog<\/title>/);
  assert.ok(html.includes('<link rel="canonical" href="' + canonical + '" />'));
  assert.equal(html, sharePageHtml(shell, article, { siteUrl, basePath: '/blog/', card }));
  for (const tag of [
    'property="og:title" content="A &lt; B &amp; &quot;C&quot; · Alicia Blog"',
    'property="og:type" content="article"',
    'property="og:url" content="' + canonical + '"',
    'property="og:image" content="' + image + '"',
    'name="twitter:image" content="' + image + '"',
    'property="article:published_time" content="2026-01-02T00:00:00.000Z"',
    'property="article:modified_time" content="2026-02-03T04:00:00.000Z"',
    'property="article:section" content="Life"',
    'property="article:tag" content="中文"',
  ])
    assert.ok(html.includes(tag), 'missing ' + tag);
  assert.match(html, /<noscript>A &lt; B &amp; &quot;C&quot; · Alicia Blog/);
  assert.doesNotMatch(html, /Please enable JavaScript/);
  assert.match(html, /<script type="module" src="\/assets\/blog.js"><\/script>/);
  assert.throws(
    () =>
      sharePageHtml('<html><head></head><body></body></html>', article, {
        siteUrl,
        basePath: '/blog/',
        card,
      }),
    /分享页模板缺少/,
  );
  assert.throws(
    () => sharePageHtml(shell, article, { siteUrl, basePath: '/missing/', card }),
    /未知的分享目录/,
  );
});

for (const mode of ['development', 'preview']) {
  test(mode + ' serves one static page per published document', async (t) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'alicia-share-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const directory of ['blog', 'notes', 'content/blog', 'content/notes', 'public/images'])
      mkdirSync(path.join(root, directory), { recursive: true });
    writeFileSync(path.join(root, 'main.js'), 'document.documentElement.dataset.entry = "ready";');
    const entry = (title) =>
      shell.replaceAll('Blog · Alicia', title).replace('/assets/blog.js', '/main.js');
    writeFileSync(path.join(root, 'index.html'), entry('Home'));
    writeFileSync(path.join(root, 'blog/index.html'), entry('Blog'));
    writeFileSync(path.join(root, 'notes/index.html'), entry('Notes'));
    writeFileSync(
      path.join(root, '404.html'),
      '<html><head><title>Page not found</title></head><body><h1>404</h1></body></html>',
    );
    writeFileSync(
      path.join(root, 'content/blog/post.md'),
      '---\ntitle: Static share post\ndescription: Summary text\nsection: life\ntags: [life]\n---\n\nBody text.',
    );
    writeFileSync(path.join(root, 'content/notes/note.md'), '# Note title\n\nNote body.');
    writeFileSync(path.join(root, 'content/blog/draft.md'), '---\ndraft: true\n---\n# Draft');
    writeFileSync(path.join(root, 'public/images/summer-sky.webp'), 'fake sky bytes');

    const publicRoot = path.join(root, 'public');
    const cards = new Map();
    for (const collection of cardCollections) {
      const catalog = buildArticleCatalog(path.join(root, collection.directory), () => {}, {
        basePath: collection.basePath,
      });
      for (const item of catalog.articles) {
        const info = articleCard(item, collection.basePath, { publicRoot });
        cards.set(collection.basePath + item.slug, info);
        mkdirSync(path.dirname(info.file), { recursive: true });
        writeFileSync(info.file, 'fake card');
      }
    }
    const home = siteCard({ publicRoot });
    mkdirSync(path.dirname(home.file), { recursive: true });
    writeFileSync(home.file, 'fake card');

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
      base: '/',
      logLevel: 'silent',
      plugins: [notFoundPlugin(), blog, notes, sharePlugin([blog.api, notes.api], { siteUrl })],
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
        build: {
          rolldownOptions: {
            input: ['index.html', 'blog/index.html', 'notes/index.html', '404.html'].map((file) =>
              path.join(root, file),
            ),
          },
        },
      });
      assert.ok(existsSync(path.join(root, 'dist/blog/post/index.html')));
      server = await preview({ ...options, preview: { host: '127.0.0.1', port: 0 } });
      t.after(() => new Promise((resolve) => server.httpServer.close(resolve)));
    }
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    const listing = await (await fetch(origin + '/blog/')).text();
    assert.match(listing, /<title>Blog<\/title>/);

    const page = await fetch(origin + '/blog/post/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const html = await page.text();
    assert.match(html, /<title>Static share post · Alicia Blog<\/title>/);
    assert.match(html, /content="Summary text"/);
    assert.match(html, /property="og:type" content="article"/);
    assert.match(html, /property="article:section" content="Life"/);
    assert.ok(html.includes('href="https://example.com/blog/post/"'));
    const info = cards.get('/blog/post');
    assert.ok(html.includes('content="https://example.com' + info.url + '"'));
    assert.match(html, /<script type="module"/);

    const note = await (await fetch(origin + '/notes/note/')).text();
    assert.match(note, /<title>Note title · Alicia<\/title>/);
    assert.match(note, /href="https:\/\/example.com\/notes\/note\/"/);

    const headResponse = await fetch(origin + '/blog/post/', { method: 'HEAD' });
    assert.equal(headResponse.status, 200);
    assert.equal(await headResponse.text(), '');
    for (const missing of ['/blog/missing/', '/blog/draft/', '/notes/deep/missing/']) {
      const response = await fetch(origin + missing);
      assert.equal(response.status, 404, missing + ' should not render a share page');
    }
    const image = await fetch(origin + info.url);
    assert.equal(image.status, 200);
    assert.ok((await image.arrayBuffer()).byteLength > 0);
  });
}

test('a missing share card fails the build instead of shipping a stale preview', async (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'alicia-share-missing-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ['blog', 'notes', 'content/blog', 'content/notes', 'public/images'])
    mkdirSync(path.join(root, directory), { recursive: true });
  writeFileSync(path.join(root, 'main.js'), 'document.documentElement.dataset.entry = "ready";');
  for (const file of ['index.html', 'blog/index.html', 'notes/index.html', '404.html'])
    writeFileSync(path.join(root, file), shell.replace('/assets/blog.js', '/main.js'));
  writeFileSync(path.join(root, 'content/blog/post.md'), '---\ntitle: Post\n---\n\nBody');
  writeFileSync(path.join(root, 'public/images/summer-sky.webp'), 'fake sky bytes');
  const blog = articlesPlugin();
  const notes = articlesPlugin({
    directory: 'content/notes',
    moduleId: 'virtual:notes',
    basePath: '/notes/',
  });
  await assert.rejects(
    build({
      root,
      configFile: false,
      appType: 'mpa',
      logLevel: 'silent',
      plugins: [blog, notes, sharePlugin([blog.api, notes.api], { siteUrl })],
      build: {
        rolldownOptions: {
          input: ['index.html', 'blog/index.html', 'notes/index.html', '404.html'].map((file) =>
            path.join(root, file),
          ),
        },
      },
    }),
    /缺少/,
  );
});

test('every published document ships a current 1200x630 share card', () => {
  const publicRoot = path.join(repo, 'public');
  let cards = 0;
  for (const collection of cardCollections) {
    const catalog = buildArticleCatalog(path.join(repo, collection.directory), () => {}, {
      basePath: collection.basePath,
    });
    for (const item of catalog.articles) {
      const info = requireCard(item, collection.basePath, { publicRoot });
      assert.deepEqual(
        jpegSize(readFileSync(info.file)),
        { width: 1200, height: 630 },
        info.relative,
      );
      cards++;
    }
  }
  assert.ok(cards > 0, 'no published documents were found');
  const home = requireSiteCard({ publicRoot });
  assert.deepEqual(jpegSize(readFileSync(home.file)), { width: 1200, height: 630 });
});
