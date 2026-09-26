import test from 'node:test';
import assert from 'node:assert/strict';
import { sortArticles, sortFromSearch } from '../src/content/sort.ts';
import { articleUrl, listingUrl, queryFromSearch } from '../src/content/urls.ts';

const articles = Object.freeze([
  Object.freeze({ slug: 'a', title: 'Chapter 10', date: '2026-01-01', updated: '2026-03-01' }),
  Object.freeze({ slug: 'b', title: 'Chapter 2', date: '2026-02-01', updated: '' }),
  Object.freeze({ slug: 'c', title: 'Alpha', date: '2026-01-15', updated: '' }),
]);

test('post sorting handles publication, update fallback and natural title order without mutation', () => {
  const expected = {
    newest: ['b', 'c', 'a'],
    oldest: ['a', 'c', 'b'],
    updated: ['a', 'b', 'c'],
    title: ['c', 'b', 'a'],
  };
  for (const [sort, slugs] of Object.entries(expected)) {
    assert.deepEqual(
      sortArticles(articles, sort).map((article) => article.slug),
      slugs,
    );
    assert.deepEqual(sortArticles([], sort), []);
  }
});

test('date sorting compares instants across time zones and breaks ties deterministically', () => {
  const entries = [
    { ...articles[0], slug: 'b', date: '2026-01-01T23:00:00-08:00' },
    { ...articles[0], slug: 'a', date: '2026-01-02T07:00:00Z' },
    { ...articles[0], slug: 'c', date: '2026-01-02T08:00:00+08:00' },
  ];
  assert.deepEqual(
    sortArticles(entries, 'newest').map((article) => article.slug),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    sortArticles(entries, 'oldest').map((article) => article.slug),
    ['c', 'a', 'b'],
  );
});

test('sort and search survive reading, paging and returning while unknown sort values use newest', () => {
  for (const sort of ['newest', 'oldest', 'updated', 'title']) {
    const query = ' C++ & 中文 ';
    const reader = new URL(articleUrl('nested/post', query, sort), 'https://example.com/blog/');
    assert.equal(sortFromSearch(reader.search), sort);
    const next = new URL(
      articleUrl('another', queryFromSearch(reader.search), sortFromSearch(reader.search)),
      reader,
    );
    const back = new URL(
      listingUrl(queryFromSearch(next.search), sortFromSearch(next.search)),
      next,
    );
    assert.equal(sortFromSearch(back.search), sort);
    assert.equal(queryFromSearch(back.search), query);
    assert.equal(back.searchParams.has('post'), false);
    assert.equal(back.searchParams.has('sort'), sort !== 'newest');
  }
  for (const search of ['', '?sort=unknown', '?sort=', '?sort=https://example.com']) {
    assert.equal(sortFromSearch(search), 'newest');
  }
});
