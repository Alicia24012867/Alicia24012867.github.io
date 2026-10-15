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
