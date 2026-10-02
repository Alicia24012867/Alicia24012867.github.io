import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { decodeHTML } from 'entities';
import { blogFeed, feedFormats } from '../src/config/feeds.mjs';

const report = process.argv.includes('--report');
const root = path.resolve(process.argv.slice(2).find((arg) => arg !== '--report') || 'dist');
const sizes = {};
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.vite/manifest.json'), 'utf8'));
const deferred = /virtual:|ArticleReader|NoteReader|ArticleBody|renderMermaid|katex/i;
for (const page of ['index.html', 'blog/index.html', 'notes/index.html', '404.html']) {
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
      const data = fs.readFileSync(path.join(root, file));
      const type = file.endsWith('.css') ? 'css' : 'js';
      total[type] += data.length;
      total[`${type}Gzip`] += gzipSync(data).length;
    }
    sizes[page] = total;
  }
}
for (const { path: pathname, type } of feedFormats) {
  const xml = fs.readFileSync(path.join(root, pathname), 'utf8');
  assert.ok(xml.startsWith('<?xml version="1.0"'), `Missing XML declaration: ${pathname}`);
  for (const page of ['index.html', 'blog/index.html', 'notes/index.html', '404.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.ok(html.includes(`type="${type}"`), `${page} does not discover ${type}`);
    assert.ok(html.includes(`href="${pathname}"`), `${page} does not link to ${pathname}`);
  }
}
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
assert.match(sitemap, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
assert.doesNotMatch(sitemap, /404\.html|[?&](?:q|sort)=/);
const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
assert.ok(robots.includes(`Sitemap: ${new URL('/sitemap.xml', blogFeed.siteUrl).href}`));
const notFound = fs.readFileSync(path.join(root, '404.html'), 'utf8');
assert.match(notFound, /<meta name="robots" content="noindex"/);
for (const match of notFound.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = match[1];
  if (url.startsWith('https://')) continue;
  assert.ok(url.startsWith('/') && !url.startsWith('//'), `404 URL is not root-relative: ${url}`);
  assert.ok(fs.existsSync(path.join(root, url)), `404 target is missing: ${url}`);
}
// Every published document ships a static share page with its own title card.
const jpegSize = (buffer) => {
  assert.equal(buffer.readUInt16BE(0), 0xffd8, 'Share card is not a JPEG file');
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
};
const assertCard = (url, label) => {
  assert.ok(url, label + ' has no share card');
  const pathname = new URL(decodeHTML(url)).pathname;
  assert.ok(pathname.startsWith('/images/share/'), label + ' uses an unexpected image: ' + url);
  const file = path.join(root, decodeURIComponent(pathname).slice(1));
  assert.ok(fs.existsSync(file), 'Missing share card: ' + url);
  assert.deepEqual(jpegSize(fs.readFileSync(file)), { width: 1200, height: 630 }, url);
};
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
  assertCard(html.match(/<meta property="og:image" content="([^"]+)"\s*\/?>/)?.[1], pathname);
}
for (const page of ['index.html', 'blog/index.html', 'notes/index.html']) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
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
    'Build verified: listings exclude article bodies, readers, diagrams, and formula styles.',
  );
