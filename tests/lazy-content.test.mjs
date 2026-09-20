import test from 'node:test';
import assert from 'node:assert/strict';
import { articleModule, listingModule, searchModule } from '../scripts/content/modules.mjs';
import { headingAt } from '../src/content/reader/headingPosition.ts';

const article = {
  slug: 'nested/中文:note',
  title: 'Title',
  date: '2026-09-19',
  updated: '2026-09-21',
  description: 'Summary',
  tags: [],
  html: '<p>PrivateBodyToken</p><img src="__ALICIA_ARTICLE_ASSET_1__">',
  searchText: 'privatebodytoken',
  headings: [{ id: 'section', text: 'Section', level: 2 }],
  backlinks: ['another'],
};

test('listing modules contain metadata and dynamic loaders without shipping article bodies or search text', async () => {
  const code = listingModule({ articles: [article] }, 'virtual:notes');
  assert.doesNotMatch(code, /PrivateBodyToken|privatebodytoken|backlinks|<p>|<img/);
  assert.match(code, /import\("virtual:notes\/entry\/nested%2F/);
  const module = await import(`data:text/javascript,${encodeURIComponent(code)}`);
  assert.equal(module.default[0].slug, article.slug);
  assert.equal(module.default[0].date, article.date);
  assert.equal(module.default[0].updated, article.updated);
  await assert.rejects(module.loadArticle('__proto__'), /Unknown article/);
  await assert.rejects(module.loadArticle('absent'), /Unknown article/);
});

test('article chunks include only referenced assets; search payloads contain text but no markup', async () => {
  const assets = new Map([
    ['__ALICIA_ARTICLE_ASSET_0__', '/unused.svg'],
    ['__ALICIA_ARTICLE_ASSET_1__', '/used.svg'],
  ]);
  const code = articleModule(article, assets);
  assert.doesNotMatch(code, /unused.svg|searchText|privatebodytoken/);
  assert.match(code, /used.svg\?url/);
  assert.match(code, /PrivateBodyToken/);
  const module = await import(
    `data:text/javascript,${encodeURIComponent(searchModule({ articles: [article] }))}`
  );
  assert.equal(module.default[article.slug], 'privatebodytoken');
});

test('cached heading lookup handles boundaries, repeated positions, and large documents', () => {
  const positions = [
    { id: 'first', top: 100 },
    { id: 'same', top: 100 },
    { id: 'last', top: 200 },
  ];
  assert.equal(headingAt([], 20), '');
  assert.equal(headingAt(positions, 0), 'first');
  assert.equal(headingAt(positions, 100), 'same');
  assert.equal(headingAt(positions, 199), 'same');
  assert.equal(headingAt(positions, 200), 'last');
  const many = Array.from({ length: 10000 }, (_, i) => ({ id: String(i), top: i * 100 }));
  assert.equal(headingAt(many, 555550), '5555');
});
