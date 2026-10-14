import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entries = ['index.html', 'blog/index.html', 'notes/index.html', '404.html'];

test('every entry shares one font stylesheet that requests weight ranges', () => {
  const links = entries.map((entry) => {
    const html = readFileSync(new URL('../' + entry, import.meta.url), 'utf8');
    const href = html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/)?.[1];
    assert.ok(href, entry + ' has no font stylesheet');
    return href;
  });
  assert.equal(new Set(links).size, 1, 'Entries must request the same fonts');
  const families = new URL(links[0].replaceAll('&amp;', '&')).searchParams.getAll('family');
  assert.equal(families.length, 2);
  // Listed weights repeat every unicode-range face once per weight for the same font
  // files; a range keeps one face per subset and renders any weight inside it.
  for (const family of families) assert.match(family, /:(?:ital,)?wght@(?:1,)?\d+\.\.\d+$/, family);
});
