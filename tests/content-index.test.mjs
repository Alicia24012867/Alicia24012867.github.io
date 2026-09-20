import test from 'node:test';
import assert from 'node:assert/strict';
import { createContentIndex } from '../src/content/index.ts';

const articles = [
  {
    slug: 'cuda/api',
    section: 'learn',
    title: 'CUDA API',
    description: '',
    tags: ['GPU'],
    searchText: '正文 synchronization',
  },
  {
    slug: 'life/day',
    section: 'life',
    title: 'A day',
    description: 'Blue skies',
    tags: [],
    searchText: 'sea',
  },
  {
    slug: 'cuda/memory',
    section: 'learn',
    title: 'Memory',
    description: '',
    tags: ['CUDA'],
    searchText: 'allocations',
  },
];
const labels = new Map([
  ['learn', 'Learning'],
  ['life', 'Life'],
]);

test('collection search preserves ordering, matches metadata and separates full-text behavior', () => {
  const blog = createContentIndex(articles, (article) => article.section, labels);
  const notes = createContentIndex(
    articles,
    (article) => article.section,
    labels,
    Object.fromEntries(articles.map((article) => [article.slug, article.searchText])),
  );
  assert.equal(blog.bySlug.get('cuda/api'), articles[0]);
  assert.deepEqual(
    blog
      .filter('  CUDA ')
      .get('learn')
      .map((article) => article.slug),
    ['cuda/api', 'cuda/memory'],
  );
  assert.equal(blog.filter('learning').get('learn').length, 2);
  assert.equal(blog.filter('正文').get('learn').length, 0);
  assert.deepEqual(notes.filter('正文').get('learn'), [articles[0]]);
  assert.equal(notes.filter('absent').get('learn').length, 0);
  assert.deepEqual(notes.filter(' ').get('life'), [articles[1]]);
  assert.deepEqual(
    notes.groups.get('learn'),
    [articles[0], articles[2]],
    'Search must not mutate the source groups',
  );
});

test('an empty collection has no results or stale slug lookups', () => {
  const index = createContentIndex(
    [],
    (article) => article.section,
    labels,
    Object.fromEntries(articles.map((article) => [article.slug, article.searchText])),
  );
  assert.equal(index.bySlug.get('missing'), undefined);
  assert.equal(index.filter('anything').size, 0);
});

test('prototype-named slugs do not introduce inherited properties into search text', () => {
  const entries = ['constructor', 'toString'].map((slug) => ({
    ...articles[0],
    slug,
    title: 'A normal note',
  }));
  const metadata = createContentIndex(entries, (article) => article.section, labels);
  assert.deepEqual(metadata.filter('native code').get('learn'), []);
  const full = createContentIndex(entries, (article) => article.section, labels, {
    constructor: 'A real formula',
    toString: 'Memory allocation',
  });
  assert.deepEqual(full.filter('formula').get('learn'), [entries[0]]);
  assert.deepEqual(full.filter('allocation').get('learn'), [entries[1]]);
});

test('successive searches match a fresh search when typing, deleting, replacing, and clearing', () => {
  const build = () => createContentIndex(articles, (article) => article.section, labels);
  const index = build();
  for (const query of [
    'c',
    'cu',
    'cuda',
    'CUDA ',
    'cu',
    'day',
    'absent',
    'absent!',
    'a',
    '',
    'gpu',
  ]) {
    assert.deepEqual(index.filter(query), build().filter(query), query);
  }
  const result = index.filter('cuda');
  assert.equal(index.filter(' CUDA '), result, 'Equivalent searches reuse the result');
  assert.deepEqual(index.filter('cuda api').get('learn'), [articles[0]]);
  assert.deepEqual(result.get('learn'), [articles[0], articles[2]], 'Earlier results stay intact');
  assert.equal(index.filter(' '), index.groups);
});
