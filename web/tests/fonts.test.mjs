import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const entries = ['index.html', 'blog/index.html', 'notes/index.html', '404.html'];
const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const fontsCss = read('src/styles/fonts.css');
const faces = [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
  family: body.match(/font-family:\s*'([^']+)'/)?.[1],
  weight: body.match(/font-weight:\s*([^;]+);/)?.[1],
  display: body.match(/font-display:\s*([^;]+);/)?.[1],
  url: body.match(/url\('([^']+)'\)/)?.[1],
  range: body.match(/unicode-range:\s*([^;]+);/)?.[1],
}));

test('pages load their fonts from the site, never from a font service', () => {
  for (const entry of entries) {
    assert.doesNotMatch(read(entry), /fonts\.(googleapis|gstatic)\.com/, entry);
  }
  assert.doesNotMatch(fontsCss, /https?:/);
  // Every page shares the global stylesheet, which brings the fonts with it.
  assert.match(read('src/styles/global.css'), /^@import '\.\/fonts\.css';/);
});

test('each font slice has one face, one file, and swaps in once loaded', () => {
  assert.ok(faces.length > 100);
  const used = new Set();
  for (const face of faces) {
    assert.ok(face.url?.startsWith('/fonts/'), face.url);
    assert.ok(existsSync(new URL('../public' + face.url, import.meta.url)), face.url);
    assert.ok(!used.has(face.url), 'shared file ' + face.url);
    used.add(face.url);
    assert.equal(face.display, 'swap');
    assert.ok(face.range, face.url + ' has no character range');
    // A weight range keeps one face per slice and renders any weight inside it.
    assert.match(face.weight, /^\d+ \d+$/, face.url);
  }
  const files = readdirSync(new URL('../public/fonts', import.meta.url), { recursive: true })
    .filter((file) => file.endsWith('.woff2'))
    .map((file) => '/fonts/' + file.replaceAll('\\', '/'));
  assert.deepEqual(files.sort(), [...used].sort(), 'Every file in public/fonts is used once');
});

test('the faces match the fonts the styles ask for', () => {
  const global = read('src/styles/global.css');
  assert.match(global, /--font-body:\s*'Noto Sans SC',/);
  assert.match(global, /--font-display: 'Playfair Display',/);
  assert.deepEqual([...new Set(faces.map((face) => face.family))].sort(), [
    'Noto Sans SC',
    'Playfair Display',
  ]);
});

test('every page preloads the Latin slices that its first screen uses', () => {
  const latin = faces.filter((face) => face.url.endsWith('/latin.woff2')).map((face) => face.url);
  assert.equal(latin.length, 2);
  for (const entry of entries) {
    const preloaded = [
      ...read(entry).matchAll(/<link\s+rel="preload"\s+href="%BASE_URL%([^"]+)"\s+as="font"/g),
    ].map(([, href]) => '/' + href);
    assert.deepEqual(preloaded.sort(), latin.sort(), entry);
  }
});
