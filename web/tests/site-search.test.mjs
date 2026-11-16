import test from 'node:test';
import assert from 'node:assert/strict';
import { byFit, createContentIndex } from '../src/content/search.ts';

const entry = (slug, title, description = '', tags = []) => ({
  slug,
  section: 'learn',
  title,
  description,
  tags,
});

test('a quick search offers the titles that begin with the query first', () => {
  const entries = [
    entry('body', 'Notes', 'Nothing here'),
    entry('summary', 'Moments', 'A GPU story'),
    entry('tag', 'Week', '', ['gpu']),
    entry('inside', 'Fast GPU code'),
    entry('start', 'GPU basics'),
    entry('tag-part', 'Days', '', ['gpus']),
  ];
  assert.deepEqual(
    byFit(entries, ' GPU ').map(({ slug }) => slug),
    ['start', 'inside', 'tag', 'summary', 'tag-part', 'body'],
  );
  // Each kind keeps the order it came in: posts newest first, notes by title.
  assert.deepEqual(
    byFit([entry('b', 'Go far'), entry('a', 'Go near')], 'go').map(({ slug }) => slug),
    ['b', 'a'],
  );
  // Chinese has no case to fold, and is found as it is.
  assert.deepEqual(
    byFit([entry('x', '日常'), entry('y', '写在20岁前')], '20岁').map(({ slug }) => slug),
    ['y', 'x'],
  );
  assert.deepEqual(
    byFit(entries, '  ').map(({ slug }) => slug),
    entries.map(({ slug }) => slug),
  );
});

test('a quick search finds what the listing finds, in the catalog order', () => {
  const posts = [
    entry('new', 'Newest', 'about skies'),
    entry('mid', 'Skies at dusk'),
    entry('old', 'Oldest', '', ['sky']),
  ];
  const index = createContentIndex(posts, (post) => post.section, new Map([['learn', 'Learning']]));
  const matching = new Set([...index.filter('sk').values()].flat());
  const found = byFit(
    [...index.bySlug.values()].filter((post) => matching.has(post)),
    'sk',
  );
  // The summary and the tag hold the query alike, so the newer post comes first.
  assert.deepEqual(
    found.map(({ slug }) => slug),
    ['mid', 'new', 'old'],
  );
});
