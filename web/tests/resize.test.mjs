import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createLogger, createServer } from 'vite';
import { articlesPlugin } from '../scripts/content/plugin.mjs';
import {
  copyFormat,
  copyScreens,
  copySize,
  copySizes,
  drawnWidth,
  imagePlaces,
  photoLayout,
} from '../scripts/content/resize.mjs';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const gallery = { gallery: true, figure: false, linked: true };
const figure = { gallery: false, figure: true, linked: false };
const inline = { gallery: false, figure: false, linked: false };

test('images are placed by the gallery, top-level figure or link around them', () => {
  const html = [
    '<div class="article-gallery">',
    '<figure><a href="a.jpg"><img src="a" alt="" /></a><figcaption>A</figcaption></figure>',
    '<figure><img src="b"></figure>',
    '</div>',
    '<figure><a href="c.jpg"><img src="c" /></a><figcaption>C <br> D</figcaption></figure>',
    '<p>Text <img src="d"> and <a href="/blog/x/">a link</a>.</p>',
    '<ul><li><figure><img src="e"></figure></li></ul>',
    '<div class="footnote-content"><img src="f"></div>',
    '<p><span class="katex"><svg><path d="M0 0"/></svg></span><img src="g"></p>',
  ].join('\n');
  assert.deepEqual(imagePlaces(html), [
    { gallery: true, figure: false, linked: true },
    { gallery: true, figure: false, linked: false },
    { gallery: false, figure: true, linked: true },
    inline,
    inline,
    inline,
    inline,
  ]);
});

test('photos are drawn at the widths the browser shows them at', () => {
  // Measured in Chrome on a 390px phone, whose column is 350px wide.
  assert.equal(+drawnWidth({ width: 1024, height: 768 }, gallery, 350).toFixed(2), 108.67);
  assert.equal(+drawnWidth({ width: 1280, height: 2772 }, figure, 350).toFixed(2), 165.31);
  // A tall photo in a gallery cell fills its height, not its width.
  assert.equal(+drawnWidth({ width: 590, height: 1332 }, gallery, 350).toFixed(2), 48.13);
  // Smaller photos are drawn at their own size outside galleries.
  assert.equal(drawnWidth({ width: 300, height: 200 }, inline), 300);
});

test('copies cover phones at three device pixels and computers at two, with a fifth to spare', () => {
  // A 4:3 photo in a gallery: 122px cells on a 430px phone, 232px on computers.
  assert.deepEqual(copySize({ width: 1024, height: 768 }, gallery), { width: 557, height: 418 });
  assert.deepEqual(copySize({ width: 760, height: 570 }, gallery), { width: 557, height: 418 });
  assert.deepEqual(copySize({ width: 590, height: 1332 }, gallery), { width: 247, height: 557 });
  // A phone screenshot held to 358px tall is drawn 165px wide on every screen: 595px with
  // the spare, and the smallest size of exactly its shape (320:693) above that.
  assert.deepEqual(copySize({ width: 1280, height: 2772 }, figure), { width: 640, height: 1386 });
  assert.deepEqual(copySize({ width: 300, height: 2000 }, figure), { width: 195, height: 1300 });
  // A camera photo in the text: 1.2 x the 718px column at two device pixels.
  assert.deepEqual(copySize({ width: 4000, height: 3000 }, inline), { width: 1724, height: 1293 });
  // Photos not much larger than that load as they are.
  assert.equal(copySize({ width: 680, height: 510 }, gallery), undefined);
  assert.equal(copySize({ width: 1280, height: 2772 }, inline), undefined);
  assert.equal(copySize({ width: 300, height: 2000 }, inline), undefined);
  // Outside galleries, a photo with no smaller size of exactly its shape loads whole.
  assert.equal(copySize({ width: 3851, height: 2617 }, inline), undefined);
});

test('every copy has the pixels its screens need and keeps the shape that sets its height', () => {
  const { phone, phoneDensity, density, spare } = copyScreens;
  const phoneColumn = phone - 2 * photoLayout.phoneGutter;
  let random = 7;
  const next = (most) => 1 + ((random = (random * 48271) % 2147483647) % most);
  let copies = 0;
  for (let run = 0; run < 3000; run++) {
    const size = { width: next(6000), height: next(6000) };
    for (const place of [gallery, figure, inline]) {
      const copy = copySize(size, place);
      const needed =
        spare *
        Math.max(
          phoneDensity * drawnWidth(size, place, phoneColumn),
          density * drawnWidth(size, place),
        );
      const detail = JSON.stringify({ size, place, copy });
      if (place.gallery) {
        // A copy whenever one is at most 80% as wide as the photo, rounded to whole pixels.
        assert.equal(!!copy, needed <= size.width * 0.8 + 1e-9, detail);
        if (!copy) continue;
        assert.equal(copy.width, Math.max(1, Math.round(needed)), detail);
        assert.equal(
          copy.height,
          Math.max(1, Math.round((needed * size.height) / size.width)),
          detail,
        );
      } else {
        // The smallest size of exactly the photo's shape that is at least as wide as
        // needed, when that is at most 80% as wide as the photo.
        const divisor = (a, b) => (b ? divisor(b, a % b) : a);
        const step = size.width / divisor(size.width, size.height);
        const smallest = Math.ceil(needed / step - 1e-9) * step;
        assert.equal(!!copy, smallest <= size.width * 0.8, detail);
        if (!copy) continue;
        assert.equal(copy.width * size.height, copy.height * size.width, detail);
        assert.ok(copy.width >= needed - 1e-6 && copy.width - step < needed, detail);
      }
      copies++;
    }
  }
  assert.ok(copies > 3000);
});

test('phones as narrow as 360px shrink gallery and text photo copies by less than half', () => {
  // Chrome blurs a photo it shrinks by more than half; the photo itself was sharper there.
  const column = 360 - 2 * photoLayout.phoneGutter;
  for (const [size, place] of [
    [{ width: 1024, height: 768 }, gallery],
    [{ width: 590, height: 1332 }, gallery],
    [{ width: 1182, height: 665 }, gallery],
    [{ width: 4000, height: 3000 }, inline],
    [{ width: 1280, height: 2772 }, figure],
  ]) {
    const copy = copySize(size, place);
    const shown = drawnWidth(size, place, column) * copyScreens.phoneDensity;
    assert.ok(copy.width / shown < 2, JSON.stringify({ size, copy, shown }));
  }
});

test('the sizes attribute tells browsers how wide each photo is drawn', () => {
  assert.equal(
    copySizes({ width: 1024, height: 768 }, gallery),
    '(max-width: 600px) calc((100vw - 64px) / 3), 232px',
  );
  assert.equal(
    copySizes({ width: 590, height: 1332 }, gallery),
    '(max-width: 600px) calc((100vw - 64px) * 0.1476), 103px',
  );
  // A screenshot drawn 166px wide is that wide on any phone window wider than 208px.
  assert.equal(
    copySizes({ width: 1280, height: 2772 }, figure),
    '(max-width: 208px) calc(100vw - 42px), 166px',
  );
  assert.equal(
    copySizes({ width: 4000, height: 3000 }, inline),
    '(max-width: 600px) calc(100vw - 42px), 718px',
  );
  // On a 390px phone the gallery formula gives the cell Chrome draws.
  assert.equal(+((390 - 64) / 3).toFixed(2), 108.67);
});

test('the layout the copies are sized for matches the article styles', () => {
  const reader = read('src/content/reader/reader.css');
  const global = read('src/styles/global.css');
  const rule = (css, selector, indent = '') =>
    css.split(`\n${indent}${selector} {\n`)[1]?.split(`\n${indent}}`)[0] ?? '';
  const media = (css, width) =>
    '\n' + (css.split(`\n@media (max-width: ${width}px) {\n`)[1]?.split('\n}\n')[0] ?? '');
  const pixels = (text, pattern) => Number(text.match(pattern)?.[1]);
  const { column, galleryColumns, galleryGap, figureHeight, border } = photoLayout;

  const galleryRule = rule(reader, '.article-body .article-gallery');
  assert.match(
    galleryRule,
    new RegExp(`grid-template-columns: repeat\\(${galleryColumns}, minmax\\(0, 1fr\\)\\);`),
  );
  assert.equal(pixels(galleryRule, /\bgap: (\d+)px;/), galleryGap);
  assert.match(rule(reader, '.article-body .article-gallery img'), /\bborder: 0;/);
  assert.equal(pixels(rule(reader, '.article-body img'), /\bborder: (\d+)px solid/), border);
  assert.equal(
    pixels(rule(reader, '.article-body > figure img'), /max-height: min\((\d+)px,/),
    figureHeight,
  );

  // The widest the reading column gets: its own limit on wide windows, and just inside
  // each breakpoint, the window less its gutters and the side column.
  const gutterAt = (width) => {
    const limits = [...global.matchAll(/\n@media \(max-width: (\d+)px\) \{\n([\s\S]*?)\n\}\n/g)]
      .map(([, limit, block]) => ({
        limit: Number(limit),
        gutter: pixels(block, /:root \{[^}]*--gutter: (\d+)px;/),
      }))
      .filter(({ limit, gutter }) => width <= limit && Number.isFinite(gutter))
      .sort((a, b) => a.limit - b.limit);
    return limits[0]?.gutter ?? pixels(global, /\n  --gutter: (\d+)px;/);
  };
  // Up to the phone window, the column is the window less two phone gutters.
  assert.equal(gutterAt(photoLayout.phoneWindow), photoLayout.phoneGutter);
  assert.notEqual(gutterAt(photoLayout.phoneWindow + 1), photoLayout.phoneGutter);
  const widest = pixels(
    rule(reader, '.reading-layout'),
    /grid-template-columns: minmax\(0, (\d+)px\)/,
  );
  const tablet = rule(media(reader, 1000), '.reading-layout', '  ');
  const side =
    pixels(tablet, /grid-template-columns: minmax\(0, 1fr\) (\d+)px;/) +
    pixels(tablet, /\bgap: (\d+)px;/);
  assert.match(rule(media(reader, 760), '.reading-layout', '  '), /display: flex;/);
  const widths = [widest, 1000 - 2 * gutterAt(1000) - side, 760 - 2 * gutterAt(760)];
  assert.ok(widths.every(Number.isFinite), String(widths));
  assert.ok(Math.max(...widths) <= column, `The column can be ${Math.max(...widths)}px wide`);
  assert.ok(Math.max(...widths) > column - 20, 'photoLayout.column is far above the real column');
});

test('only JPEG and still PNG files get copies', async () => {
  const pixels = sharp({ create: { width: 4, height: 4, channels: 3, background: '#7ab' } });
  assert.equal(copyFormat(await pixels.clone().jpeg().toBuffer()), 'jpeg');
  assert.equal(copyFormat(await pixels.clone().png().toBuffer()), 'png');
  assert.equal(copyFormat(await pixels.clone().webp().toBuffer()), undefined);
  assert.equal(copyFormat(await pixels.clone().gif().toBuffer()), undefined);
  const still = await pixels.clone().png().toBuffer();
  // An animation control chunk goes before the image data.
  const control = Buffer.alloc(20);
  control.writeUInt32BE(8, 0);
  control.write('acTL', 4, 'latin1');
  assert.equal(
    copyFormat(Buffer.concat([still.subarray(0, 33), control, still.subarray(33)])),
    undefined,
  );
});

// A grainy photo, which compresses no better than a real one.
const photo = (width, height) =>
  sharp({
    create: { width, height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 30 } },
  });

test('articles show photo copies, link and open the full-size files, and keep their sizes', async (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'alicia-photo-copies-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const assets = path.join(root, 'content/blog/assets');
  mkdirSync(assets, { recursive: true });
  mkdirSync(path.join(root, 'public/images'), { recursive: true });
  // A wide-colour phone photo, whose copy keeps its colour profile.
  await photo(1600, 1200)
    .withIccProfile('p3')
    .jpeg({ quality: 95 })
    .toFile(path.join(assets, 'camera.jpg'));
  const p3 = (await sharp(path.join(assets, 'camera.jpg')).metadata()).icc;
  assert.ok(p3);
  await photo(1000, 2400).png().toFile(path.join(assets, 'screenshot.png'));
  await photo(800, 600).jpeg({ quality: 95 }).toFile(path.join(assets, 'small.jpg'));
  await photo(3000, 2000).jpeg({ quality: 95 }).toFile(path.join(root, 'public/images/shared.jpg'));
  // Stripes a two-colour PNG stores in a few bytes: any copy would be larger.
  const stripes = Buffer.alloc(1000 * 1000 * 3);
  for (let at = 0; at < stripes.length; at += 6) stripes.fill(255, at, at + 3);
  await sharp(stripes, { raw: { width: 1000, height: 1000, channels: 3 } })
    .png({ palette: true, colours: 2 })
    .toFile(path.join(assets, 'stripes.png'));
  // A JPEG header without image data: its size is known, but it cannot be resized.
  const broken = Buffer.from(await photo(1600, 1200).jpeg().toBuffer()).subarray(0, 700);
  writeFileSync(path.join(assets, 'broken.jpg'), broken);
  writeFileSync(
    path.join(root, 'content/blog/photos.md'),
    [
      '# Photos',
      '<div class="article-gallery">',
      '  <figure><a href="./assets/camera.jpg"><img src="./assets/camera.jpg" alt="Camera"></a></figure>',
      '  <figure><img src="./assets/stripes.png" alt="Stripes"></figure>',
      '  <figure><img src="./assets/broken.jpg" alt="Broken"></figure>',
      '</div>',
      '',
      '<figure>\n  <img src="./assets/screenshot.png" alt="Screenshot">\n</figure>',
      '',
      '![Small](./assets/small.jpg)',
      '',
      '![Shared](/images/shared.jpg)',
    ].join('\n'),
  );
  const warnings = [];
  const logger = createLogger('warn');
  logger.warn = (message) => warnings.push(message);
  const server = await createServer({
    root,
    configFile: false,
    customLogger: logger,
    plugins: [articlesPlugin()],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  t.after(() => server.close());
  const load = async () => {
    const { code } = await server.transformRequest('virtual:articles/entry/photos');
    const files = Object.fromEntries(
      [...code.matchAll(/import (asset\d+) from "([^"?]+)\?/g)].map(([, name, file]) => [
        name,
        file,
      ]),
    );
    const urls = Object.fromEntries(
      [...code.matchAll(/"(__ALICIA_ARTICLE_ASSET_\d+__)": (asset\d+)/g)].map(
        ([, marker, name]) => [marker, files[name]],
      ),
    );
    const html = JSON.parse(code.match(/const body = (\{.*\});\n/)[1]).html;
    return { html: html.replace(/__ALICIA_ARTICLE_ASSET_\d+__/g, (marker) => urls[marker]), code };
  };
  const { html } = await load();
  const image = (alt) => html.match(new RegExp(`<img [^>]*alt="${alt}"[^>]*>`))[0];
  const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const copyOf = (alt) => path.join(root, attribute(image(alt), 'src'));
  const cache = path.join(server.config.cacheDir, 'article-images') + path.sep;

  // The camera photo shows a gallery-sized copy and links to the original, which screens
  // that need more pixels pick instead.
  const camera = image('Camera');
  assert.ok(copyOf('Camera').startsWith(cache), camera);
  assert.equal(
    attribute(camera, 'srcset'),
    `${attribute(camera, 'src')} 557w, /content/blog/assets/camera.jpg 1600w`,
  );
  assert.equal(attribute(camera, 'sizes'), '(max-width: 600px) calc((100vw - 64px) / 3), 232px');
  assert.equal(attribute(camera, 'width'), '1600');
  assert.equal(attribute(camera, 'height'), '1200');
  // Gallery cells are square whatever the copy's shape.
  assert.equal(attribute(camera, 'style'), '--ratio: 1600 / 1200');
  assert.equal(attribute(camera, 'data-full-src'), undefined);
  assert.match(html, /<a href="\/content\/blog\/assets\/camera\.jpg"><img /);
  const cameraCopy = await sharp(copyOf('Camera')).metadata();
  assert.deepEqual([cameraCopy.width, cameraCopy.height, cameraCopy.format], [557, 418, 'jpeg']);
  assert.deepEqual(cameraCopy.icc, p3);
  assert.equal(cameraCopy.exif, undefined);

  // The unlinked screenshot opens its full-size file in the photo viewer.
  const screenshot = image('Screenshot');
  assert.ok(copyOf('Screenshot').startsWith(cache));
  assert.equal(attribute(screenshot, 'data-full-src'), '/content/blog/assets/screenshot.png');
  assert.equal(
    attribute(screenshot, 'srcset'),
    `${attribute(screenshot, 'src')} 540w, /content/blog/assets/screenshot.png 1000w`,
  );
  assert.equal(attribute(screenshot, 'sizes'), '(max-width: 192px) calc(100vw - 42px), 150px');
  // The copy has exactly the photo's shape, so the box it fills does not change.
  assert.equal(attribute(screenshot, 'style'), '--ratio: 1000 / 2400');
  const screenshotCopy = await sharp(copyOf('Screenshot')).metadata();
  assert.deepEqual(
    [screenshotCopy.format, screenshotCopy.width, screenshotCopy.height],
    ['png', 540, 1296],
  );

  // Small photos, photos a copy would not shrink, broken files and public images stay.
  for (const [alt, file] of [
    ['Small', '/content/blog/assets/small.jpg'],
    ['Stripes', '/content/blog/assets/stripes.png'],
    ['Broken', '/content/blog/assets/broken.jpg'],
    ['Shared', '/images/shared.jpg'],
  ]) {
    const tag = image(alt);
    assert.equal(attribute(tag, 'src'), file, alt);
    assert.doesNotMatch(tag, /\s(?:srcset|sizes|data-full-src)=/, alt);
  }
  assert.equal(warnings.length, 1, warnings.join('\n'));
  assert.match(warnings[0], /Showing content\/blog\/assets\/broken\.jpg at full size/);

  // Copies are made once: an edit elsewhere in the article reuses them.
  const made = statSync(copyOf('Camera')).mtimeMs;
  const article = path.join(root, 'content/blog/photos.md');
  writeFileSync(article, readFileSync(article, 'utf8') + '\n\nOne more line.');
  server.watcher.emit('change', article);
  const again = await load();
  assert.match(again.html, /One more line/);
  assert.equal(statSync(copyOf('Camera')).mtimeMs, made);
  assert.equal(warnings.length, 1);
});
