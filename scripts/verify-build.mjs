import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { decodeHTML } from 'entities';
import { blogFeed, feedFormats } from '../src/config/feeds.mjs';
import { decodeSlug } from '../src/config/sharing.mjs';
import { jpegSize } from './share/jpeg.mjs';

const report = process.argv.includes('--report');
const root = path.resolve(process.argv.slice(2).find((arg) => arg !== '--report') || 'dist');
const pages = ['index.html', 'blog/index.html', 'notes/index.html', '404.html'];
const sizes = {};
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.vite/manifest.json'), 'utf8'));
const deferred =
  /virtual:|ArticleReader|NoteReader|ArticleBody|ArticleComments|giscus|renderMermaid|katex|content\/figures\//i;
// Entry pages share most chunks: read and compress each file once for the whole report.
const fileSizes = new Map();
function fileSize(file) {
  let size = fileSizes.get(file);
  if (!size) {
    const data = fs.readFileSync(path.join(root, file));
    size = { bytes: data.length, gzip: gzipSync(data).length };
    fileSizes.set(file, size);
  }
  return size;
}
for (const page of pages) {
  const visited = new Set();
  const files = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    assert.ok(!deferred.test(key), `${page} eagerly imports ${key}`);
    const chunk = manifest[key];
    assert.ok(chunk, `Missing build chunk: ${key}`);
    files.add(chunk.file);
    for (const css of chunk.css ?? []) {
      files.add(css);
      assert.ok(!/(katex|reader)/i.test(css), `${page} eagerly loads reader or formula styles`);
    }
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  visit(page);
  if (report) {
    const total = { js: 0, jsGzip: 0, css: 0, cssGzip: 0 };
    for (const file of files) {
      const { bytes, gzip } = fileSize(file);
      const type = file.endsWith('.css') ? 'css' : 'js';
      total[type] += bytes;
      total[`${type}Gzip`] += gzip;
    }
    sizes[page] = total;
  }
}
const entries = new Map(
  pages.map((page) => [page, fs.readFileSync(path.join(root, page), 'utf8')]),
);
for (const { path: pathname, type } of feedFormats) {
  const xml = fs.readFileSync(path.join(root, pathname), 'utf8');
  assert.ok(xml.startsWith('<?xml version="1.0"'), `Missing XML declaration: ${pathname}`);
  for (const [page, html] of entries) {
    assert.ok(html.includes(`type="${type}"`), `${page} does not discover ${type}`);
    assert.ok(html.includes(`href="${pathname}"`), `${page} does not link to ${pathname}`);
  }
}
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
assert.match(sitemap, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
assert.doesNotMatch(sitemap, /404\.html|[?&](?:q|sort)=/);
const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
assert.ok(robots.includes(`Sitemap: ${new URL('/sitemap.xml', blogFeed.siteUrl).href}`));
const notFound = entries.get('404.html');
for (const theme of ['day', 'night', 'shared'])
  assert.ok(
    fs.existsSync(path.join(root, 'giscus', theme + '.css')),
    'Missing comment theme: ' + theme,
  );
assert.match(notFound, /<meta name="robots" content="noindex"/);
for (const match of notFound.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = match[1];
  if (url.startsWith('https://')) continue;
  assert.ok(url.startsWith('/') && !url.startsWith('//'), `404 URL is not root-relative: ${url}`);
  assert.ok(fs.existsSync(path.join(root, url)), `404 target is missing: ${url}`);
}
// Every published document ships a static share page with its own title card.
const assertCard = (url, label) => {
  assert.ok(url, label + ' has no share card');
  const pathname = new URL(decodeHTML(url)).pathname;
  assert.ok(pathname.startsWith('/images/share/'), label + ' uses an unexpected image: ' + url);
  const file = path.join(root, decodeURIComponent(pathname).slice(1));
  assert.ok(fs.existsSync(file), 'Missing share card: ' + url);
  // A file that is not a JPEG has no size and fails here as well.
  assert.deepEqual(jpegSize(fs.readFileSync(file)), { width: 1200, height: 630 }, url);
};
// Each document's own script, by its path; a static page fetches its own early, and no other.
const documentScripts = new Map(
  Object.entries(manifest)
    .filter(([key]) => /^virtual:[^/]+\/entry\//.test(key))
    .map(([key, chunk]) => ['/' + chunk.file, key]),
);
const sharePages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => new URL(decodeHTML(match[1])))
  .filter((url) => url.origin === new URL(blogFeed.siteUrl).origin)
  .map((url) => url.pathname)
  .filter((pathname) => /^\/(?:blog|notes)\/.+\/$/.test(pathname));
for (const pathname of sharePages) {
  const file = path.join(root, decodeURIComponent(pathname).slice(1), 'index.html');
  assert.ok(fs.existsSync(file), 'Missing static share page: ' + pathname);
  const html = fs.readFileSync(file, 'utf8');
  const canonical = new URL(pathname, blogFeed.siteUrl).href;
  assert.match(
    html,
    /<link rel="canonical" href="[^"]+"\s*\/?>/,
    pathname + ' has no canonical link',
  );
  assert.equal(
    decodeHTML(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || ''),
    canonical,
    pathname + ' canonical link is not absolute and stable',
  );
  assert.match(html, /<meta property="og:type" content="article"\s*\/?>/, pathname);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"\s*\/?>/, pathname);
  assert.match(html, /<meta property="article:published_time" content="[^"]+"\s*\/?>/, pathname);
  assert.match(html, /<script type="module"/, pathname + ' does not boot the site');
  const [, collection, encoded] = pathname.match(/^\/(blog|notes)\/(.+)\/$/);
  const own = `virtual:${collection === 'blog' ? 'articles' : 'notes'}/entry/${encodeURIComponent(decodeSlug(encoded))}`;
  const early = [...html.matchAll(/<link rel="modulepreload" crossorigin href="([^"]+)">/g)]
    .map((match) => documentScripts.get(decodeHTML(match[1])))
    .filter(Boolean);
  assert.deepEqual(early, [own], pathname + ' must fetch its own document early, and no other');
  assertCard(html.match(/<meta property="og:image" content="([^"]+)"\s*\/?>/)?.[1], pathname);
}
for (const page of ['index.html', 'blog/index.html', 'notes/index.html']) {
  const html = entries.get(page);
  assert.match(html, /<link rel="canonical" href="[^"]+"\s*\/?>/, page + ' has no canonical link');
  assertCard(html.match(/<meta property="og:image" content="([^"]+)"\s*\/?>/)?.[1], page);
}
for (const [key, chunk] of Object.entries(manifest)) {
  if (!/virtual:.*\/entry\//.test(key)) continue;
  assert.ok(chunk.isDynamicEntry, `${key} is not lazy`);
  for (const dependency of chunk.imports ?? [])
    assert.ok(!/virtual:.*\/entry\//.test(dependency), `${key} loads another document`);
}
if (report) console.log(JSON.stringify(sizes, null, 2));
else
  console.log(
    'Build verified: listings exclude article bodies, readers, diagrams, figures, and formula styles.',
  );
