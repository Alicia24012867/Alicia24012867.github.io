import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entries = ['index.html', 'blog/index.html', 'notes/index.html', '404.html'];
const read = (file, encoding) => readFileSync(new URL('../' + file, import.meta.url), encoding);

test('every page names the site icon and the home screen icon', () => {
  for (const entry of entries) {
    const html = read(entry, 'utf8');
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="%BASE_URL%favicon\.svg" \/>/);
    assert.match(html, /<link rel="apple-touch-icon" href="%BASE_URL%apple-touch-icon\.png" \/>/);
  }
});

test('the home screen icon is an opaque 180 px square PNG', () => {
  const png = read('public/apple-touch-icon.png');
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  assert.equal(png.toString('latin1', 12, 16), 'IHDR');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [180, 180]);
  // Colour type 2 is RGB without alpha: iPhones would fill transparent corners with black.
  assert.equal(png[25], 2);
});

test('every page names the manifest, whose icons are there at their sizes', () => {
  for (const entry of entries)
    assert.match(
      read(entry, 'utf8'),
      /<link rel="manifest" href="%BASE_URL%manifest\.webmanifest" \/>/,
    );
  const manifest = JSON.parse(read('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name && manifest.short_name.length <= 12);
  for (const icon of manifest.icons) {
    const png = read('public' + icon.src);
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [width, height], icon.src);
    assert.equal(png[25], 2, `${icon.src} is opaque`);
  }
  const sizes = manifest.icons
    .filter((icon) => icon.purpose !== 'maskable')
    .map((icon) => icon.sizes);
  assert.deepEqual(sizes, ['192x192', '512x512']);
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512'));
});
