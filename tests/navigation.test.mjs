import test from 'node:test';
import assert from 'node:assert/strict';
import { articleUrl, listingUrl, queryFromSearch } from '../src/content/urls.ts';

test('article and return links preserve exact filters across collections and reloads', () => {
  for (const collection of ['blog', 'notes']) {
    for (const query of ['stream', '站点记录', ' C++ & GPU? #1 / 100% ', '']) {
      const list = `https://example.com/${collection}/`;
      const reader = new URL(articleUrl('nested/中文 note', query), list);
      assert.equal(reader.searchParams.get('post'), 'nested/中文 note');
      assert.equal(queryFromSearch(reader.search), query);
      reader.hash = '#section-heading';
      const back = new URL(listingUrl(queryFromSearch(reader.search)), reader);
      assert.equal(back.pathname, `/${collection}/`);
      assert.equal(queryFromSearch(back.search), query);
      assert.equal(back.searchParams.has('post'), false);
      assert.equal(back.hash, '');
      const next = new URL(articleUrl('another', queryFromSearch(reader.search)), reader);
      assert.equal(queryFromSearch(next.search), query);
    }
  }
});

test('direct article links return to the collection and never trust external return URLs', () => {
  assert.equal(articleUrl('test'), '?post=test');
  assert.equal(listingUrl(queryFromSearch('?post=test&returnTo=https://external.invalid/')), './');
  const query = 'https://external.invalid/?post=other#fragment';
  const back = new URL(listingUrl(query), 'https://example.com/notes/?post=test');
  assert.equal(back.origin, 'https://example.com');
  assert.equal(back.pathname, '/notes/');
  assert.equal(queryFromSearch(back.search), query);
  assert.equal(back.hash, '');
});
