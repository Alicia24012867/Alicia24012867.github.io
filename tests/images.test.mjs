import test from 'node:test';
import assert from 'node:assert/strict';
import fs, {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { buildArticleCatalog } from '../scripts/content/catalog.mjs';
import { imageSize } from '../scripts/content/images.mjs';
import { articlesPlugin } from '../scripts/content/plugin.mjs';

// Small image files built byte by byte, holding just the parts the reader looks at.
const bytes = (...parts) =>
  Buffer.concat(
    parts.map((part) => Buffer.from(part, typeof part === 'string' ? 'latin1' : undefined)),
  );
const integer =
  (size, little = false) =>
  (value) => {
    const buffer = Buffer.alloc(size);
    if (little) buffer.writeUIntLE(value, 0, size);
    else buffer.writeUIntBE(value, 0, size);
    return buffer;
  };
const u16 = integer(2);
const u32 = integer(4);
const size = (width, height) => ({ width, height });

/** A TIFF-structured EXIF block: shorts, or [numerator, denominator] rationals. */
function exif(tags, details, little = false) {
  const [w16, w32] = [integer(2, little), integer(4, little)];
  const main = Object.entries(tags);
  if (details) main.push([0x8769, 'details']);
  const sub = Object.entries(details ?? {});
  const length = (entries) => 2 + entries.length * 12 + 4;
  const detailsAt = 8 + length(main);
  let dataAt = detailsAt + (details ? length(sub) : 0);
  const data = [];
  const directory = (entries) =>
    bytes(
      w16(entries.length),
      ...entries.map(([tag, value]) => {
        if (value === 'details') return bytes(w16(Number(tag)), w16(4), w32(1), w32(detailsAt));
        if (typeof value === 'number')
          return bytes(w16(Number(tag)), w16(3), w32(1), w16(value), [0, 0]);
        data.push(w32(value[0]), w32(value[1]));
        dataAt += 8;
        return bytes(w16(Number(tag)), w16(5), w32(1), w32(dataAt - 8));
      }),
      w32(0),
    );
  const directories = [directory(main), details ? directory(sub) : []];
  return bytes(little ? 'II' : 'MM', w16(42), w32(8), ...directories, ...data);
}

const chunk = (type, ...data) => {
  const body = bytes(...data);
  return bytes(u32(body.length), type, body, u32(0));
};
const png = (width, height, ...chunks) =>
  bytes(
    [0x89],
    'PNG\r\n\x1a\n',
    chunk('IHDR', u32(width), u32(height), [8, 2, 0, 0, 0]),
    ...chunks,
    chunk('IEND'),
  );

const gif = (width, height, frame = [0, 0, width, height], version = '89a') =>
  bytes(
    `GIF${version}`,
    ...[width, height].map(integer(2, true)),
    [0x80, 0, 0, 0, 0, 0, 255, 255, 255],
    [0x21, 0xf9, 4, 0, 0, 0, 0, 0],
    [0x2c],
    ...frame.map(integer(2, true)),
    [0, 2, 2, 0x44, 1, 0, 0x3b],
  );

const segment = (marker, ...data) => {
  const body = bytes(...data);
  return bytes([0xff, marker], u16(body.length + 2), body);
};
const jpeg = (width, height, { frame = 0xc0, before = [] } = {}) =>
  bytes(
    [0xff, 0xd8],
    ...before,
    segment(frame, [8], u16(height), u16(width), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    segment(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]),
    [0xff, 0xd9],
  );
const exifSegment = (...args) => segment(0xe1, 'Exif\0\0', exif(...args));

const webpChunk = (type, ...data) => {
  const body = bytes(...data);
  return bytes(type, integer(4, true)(body.length), body, body.length % 2 ? [0] : []);
};
const webp = (...chunks) => {
  const body = bytes('WEBP', ...chunks);
  return bytes('RIFF', integer(4, true)(body.length), body);
};
const vp8 = (width, height) =>
  webpChunk(
    'VP8 ',
    [0x30, 1, 0, 0x9d, 1, 0x2a],
    ...[width, height].map(integer(2, true)),
    Buffer.alloc(8),
  );
const vp8l = (width, height) =>
  webpChunk('VP8L', [0x2f], integer(4, true)((width - 1) | ((height - 1) << 14)), [0]);
const vp8x = (width, height, flags = 0) =>
  webpChunk('VP8X', [flags, 0, 0, 0], ...[width - 1, height - 1].map(integer(3, true)));

const box = (type, ...data) => {
  const body = bytes(...data);
  return bytes(u32(body.length + 8), type, body);
};
const fullBox = (type, version, ...data) => box(type, [version, 0, 0, 0], ...data);
const ispe = (width, height) => fullBox('ispe', 0, u32(width), u32(height));
/** An AVIF file whose items list their property numbers, the primary item listing all by default. */
function avif(properties, { brand = 'avif', primary = 1, items } = {}) {
  const lists = Object.entries(items ?? { [primary]: properties.map((_, index) => index + 1) });
  return bytes(
    box('ftyp', 'mif1', u32(0), 'mif1', brand, 'miaf'),
    fullBox(
      'meta',
      0,
      fullBox('hdlr', 0, u32(0), 'pict', Buffer.alloc(13)),
      fullBox('pitm', 0, u16(primary)),
      box(
        'iprp',
        box('ipco', ...properties),
        fullBox(
          'ipma',
          0,
          u32(lists.length),
          ...lists.map(([item, list]) =>
            bytes(
              u16(Number(item)),
              [list.length],
              list.map((index) => 0x80 | index),
            ),
          ),
        ),
      ),
    ),
    box('mdat', Buffer.alloc(16)),
  );
}

test('each format gives its size from the file header', () => {
  assert.deepEqual(imageSize(png(640, 480)), size(640, 480));
  assert.deepEqual(imageSize(gif(41, 19)), size(41, 19));
  assert.deepEqual(imageSize(gif(41, 19, undefined, '87a')), size(41, 19));
  assert.deepEqual(imageSize(jpeg(1280, 2772)), size(1280, 2772));
  // Decoders skip fill bytes and long metadata before a progressive frame header.
  const metadata = [segment(0xe0, 'JFIF\0', [1, 2, 0, 0, 1, 0, 1, 0, 0]), [0xff, 0xff]];
  const profile = [segment(0xe2, Buffer.alloc(65533)), segment(0xc4, Buffer.alloc(30))];
  assert.deepEqual(
    imageSize(jpeg(61, 29, { frame: 0xc2, before: [...metadata, ...profile] })),
    size(61, 29),
  );
  assert.deepEqual(imageSize(webp(vp8(1536, 1024))), size(1536, 1024));
  assert.deepEqual(imageSize(webp(vp8l(53, 31))), size(53, 31));
  assert.deepEqual(
    imageSize(webp(vp8x(4000, 3000, 0x10), webpChunk('ALPH', [0]), vp8(4000, 3000))),
    size(4000, 3000),
  );
  assert.deepEqual(imageSize(avif([ispe(47, 33)])), size(47, 33));
  // Only the primary image counts, not an alpha plane or thumbnail listed before it.
  assert.deepEqual(
    imageSize(avif([ispe(8, 8), ispe(47, 33)], { primary: 2, items: { 1: [1], 2: [2] } })),
    size(47, 33),
  );
});

test('photos turned by EXIF swap their sides, and sizes browsers disagree on are left out', () => {
  assert.deepEqual(imageSize(jpeg(61, 29, { before: [exifSegment({ 0x0112: 6 })] })), size(29, 61));
  assert.deepEqual(
    imageSize(jpeg(61, 29, { before: [exifSegment({ 0x0112: 8 }, undefined, true)] })),
    size(29, 61),
  );
  assert.deepEqual(imageSize(jpeg(61, 29, { before: [exifSegment({ 0x0112: 3 })] })), size(61, 29));
  // A 144 dpi file that declares half its pixel size is shown at that size in some browsers;
  // a screenshot that records its full pixel size keeps it.
  const resolution = { 0x0128: 2, 0x011a: [144, 1], 0x011b: [144, 1] };
  const declared = (x, y) => [exifSegment(resolution, { 0xa002: x, 0xa003: y })];
  assert.equal(imageSize(jpeg(200, 100, { before: declared(100, 50) })), undefined);
  assert.deepEqual(imageSize(jpeg(200, 100, { before: declared(200, 100) })), size(200, 100));
  // Chrome turns PNG photos by EXIF but not WebP ones, so neither keeps a turned size.
  assert.equal(imageSize(png(37, 23, chunk('eXIf', exif({ 0x0112: 6 })))), undefined);
  assert.deepEqual(imageSize(png(37, 23, chunk('eXIf', exif({ 0x0112: 1 })))), size(37, 23));
  const exifWebp = (orientation) =>
    webp(vp8x(53, 31, 0x08), vp8(53, 31), webpChunk('EXIF', exif({ 0x0112: orientation })));
  assert.equal(imageSize(exifWebp(6)), undefined);
  assert.deepEqual(imageSize(exifWebp(3)), size(53, 31));
  // AVIF turns by quarter turns everywhere, but browsers crop it differently.
  assert.deepEqual(imageSize(avif([ispe(47, 33), box('irot', [1])])), size(33, 47));
  assert.deepEqual(imageSize(avif([ispe(47, 33), box('irot', [2])])), size(47, 33));
  assert.equal(imageSize(avif([ispe(47, 33), box('clap', Buffer.alloc(32))])), undefined);
  // Browsers grow a GIF around a first frame that leaves its declared screen.
  assert.equal(imageSize(gif(20, 20, [0, 0, 40, 30])), undefined);
  assert.deepEqual(imageSize(gif(50, 50, [10, 10, 20, 20])), size(50, 50));
  assert.equal(imageSize(gif(50, 50, [10, 10, 20, 20], '87a')), undefined);
});

test('SVG needs an absolute width and height on its root element', () => {
  const svg = (markup) => imageSize(Buffer.from(markup), 'drawing.svg');
  assert.deepEqual(
    svg('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 12 8"/>'),
    size(120, 80),
  );
  assert.deepEqual(
    svg(
      `<?xml version="1.0"?>\n<!-- <svg width="1" height="1"> -->\n<svg stroke-width="3" height='40px' width='60px'>`,
    ),
    size(60, 40),
  );
  assert.deepEqual(svg('<svg width="21mm" height="29.7mm">'), size(79, 112));
  for (const markup of [
    '<svg viewBox="0 0 64 32">',
    '<svg width="100%" height="100%">',
    '<svg width="4em" height="2em">',
    '<svg width="64">',
    '<svg width="64" height="32" style="width: 128px">',
    '<svg width="0" height="32">',
    '<html></html>',
  ])
    assert.equal(svg(markup), undefined, markup);
  // Only files served as SVG are drawn as SVG.
  assert.equal(imageSize(Buffer.from('<svg width="1" height="1">'), 'drawing.png'), undefined);
});

test('unknown, empty and damaged files have no size', () => {
  const longProfile = jpeg(61, 29, { before: [segment(0xe2, Buffer.alloc(4000))] });
  for (const buffer of [
    Buffer.alloc(0),
    Buffer.from('plain text'),
    png(640, 480).subarray(0, 20),
    longProfile.subarray(0, 2000),
    bytes([0xff, 0xd8, 0xff, 0xd9]),
    webp(vp8(53, 31)).subarray(0, 24),
    avif([ispe(47, 33)]).subarray(0, 60),
    avif([ispe(47, 33)], { brand: 'heic' }),
  ])
    assert.equal(imageSize(buffer), undefined);
});

function fixture(t, files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'alicia-image-sizes-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), contents);
  }
  return root;
}

test('local images get their real size, and authored sizes and other images stay as written', (t) => {
  const root = fixture(t, {
    'content/blog/note.md': [
      '![Attachment](./assets/photo.png)',
      '![Shared](/images/sky.gif?v=2)',
      '![Remote](https://example.com/remote.png)',
      '![Missing](/images/missing.png)',
      '![Outside](/../outside.png)',
      '![Scalable](./assets/icon.svg)',
      '<img src="./assets/photo.png" width="320" alt="Own size">',
    ].join('\n\n'),
    'content/blog/assets/photo.png': png(640, 480),
    'content/blog/assets/icon.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"/>',
    'public/images/sky.gif': gif(1536, 1024),
    'outside.png': png(10, 10),
  });
  const html = () =>
    buildArticleCatalog(path.join(root, 'content/blog'), undefined, {
      publicDir: path.join(root, 'public'),
    }).articles[0].html;
  assert.deepEqual(html().match(/<img\b[^>]*>/g), [
    '<img src="__ALICIA_ARTICLE_ASSET_0__" alt="Attachment" loading="lazy" decoding="async" width="640" height="480" style="--ratio: 640 / 480" />',
    '<img src="/images/sky.gif?v=2" alt="Shared" loading="lazy" decoding="async" width="1536" height="1024" style="--ratio: 1536 / 1024" />',
    '<img src="https://example.com/remote.png" alt="Remote" loading="lazy" decoding="async" />',
    '<img src="/images/missing.png" alt="Missing" loading="lazy" decoding="async" />',
    '<img src="/../outside.png" alt="Outside" loading="lazy" decoding="async" />',
    '<img src="__ALICIA_ARTICLE_ASSET_1__" alt="Scalable" loading="lazy" decoding="async" />',
    '<img src="__ALICIA_ARTICLE_ASSET_0__" width="320" alt="Own size" loading="lazy" decoding="async" />',
  ]);
  // Rebuilding reads no unchanged image again, and a replaced image gets its new size.
  const reads = [];
  const read = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (file, ...args) => {
    if (/\.(?:png|gif|svg)$/.test(file)) reads.push(path.basename(file));
    return read(file, ...args);
  });
  html();
  assert.deepEqual(reads, []);
  // One byte longer, so the change shows even where file times are coarse.
  writeFileSync(path.join(root, 'public/images/sky.gif'), bytes(gif(800, 600), [0]));
  assert.match(html(), /alt="Shared" loading="lazy" decoding="async" width="800" height="600"/);
  assert.deepEqual(reads, ['sky.gif']);
});

test('the development server refreshes the size of a replaced image', async (t) => {
  const root = fixture(t, {
    'content/blog/note.md': '![Shared](/images/sky.png)\n\n![Attachment](./photo.png)',
    'content/blog/photo.png': png(640, 480),
    'public/images/sky.png': png(1536, 1024),
  });
  const server = await createServer({
    root,
    configFile: false,
    plugins: [articlesPlugin()],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  t.after(() => server.close());
  const sizes = async () =>
    [
      ...(await server.transformRequest('virtual:articles/entry/note')).code.matchAll(
        /width=\\"(\d+)\\" height=\\"(\d+)\\"/g,
      ),
    ].map(([, width, height]) => `${width}x${height}`);
  assert.deepEqual(await sizes(), ['1536x1024', '640x480']);
  // Each file is replaced on its own; the new files differ in length, so even a coarse
  // clock cannot hide the change.
  const replace = (file, width, height) => {
    writeFileSync(path.join(root, file), png(width, height, chunk('tEXt', 'Comment\0replaced')));
    server.watcher.emit('change', path.join(root, file));
  };
  replace('public/images/sky.png', 800, 600);
  assert.deepEqual(await sizes(), ['800x600', '640x480']);
  replace('content/blog/photo.png', 320, 240);
  assert.deepEqual(await sizes(), ['800x600', '320x240']);
});

test('article styles scale sized images and narrow tall photos instead of squashing them', () => {
  const css = readFileSync(new URL('../src/content/reader/reader.css', import.meta.url), 'utf8');
  const rule = (selector) => css.split(`\n${selector} {\n`)[1]?.split('\n}')[0] ?? '';
  assert.match(rule('.article-body img'), /^\s*height: auto;/m);
  assert.match(
    rule('.article-body .article-gallery img'),
    /aspect-ratio: 1;[\s\S]*object-fit: contain;/,
  );
  // A photo in its own figure is held to max-height through its ratio, at the same limit.
  const figure = rule('.article-body > figure img');
  const limit = figure.match(/max-height: ([^;]+);/)?.[1];
  assert.ok(limit && figure.includes(`calc((${limit} - 2px) * var(--ratio`), figure);
});
