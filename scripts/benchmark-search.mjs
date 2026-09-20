import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createContentIndex } from '../src/content/index.ts';

const count = 10000;
const samples = 9;
const labels = new Map([['learn', 'Learning']]);
const articles = Array.from({ length: count }, (_, i) => ({
  slug: `note-${i}`,
  title: i % 25 === 0 ? `CUDA memory ${i}` : `Numerical methods ${i}`,
  description: 'Benchmark fixture',
  tags: [],
  section: 'learn',
}));
const text = Object.fromEntries(
  articles.map((article) => [
    article.slug,
    'A repeatable note about numerical methods and memory access. '.repeat(20),
  ]),
);
const index = createContentIndex(articles, (article) => article.section, labels, text);
// The previous algorithm: precompute text once, then scan the entire collection per query.
const search = new Map(
  articles.map((article) => [
    article.slug,
    [
      article.title,
      article.description,
      ...article.tags,
      labels.get(article.section),
      text[article.slug],
    ]
      .join(' ')
      .toLowerCase(),
  ]),
);
function fullScan(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return index.groups;
  return new Map(
    [...index.groups].map(([group, entries]) => [
      group,
      entries.filter((article) => search.get(article.slug).includes(needle)),
    ]),
  );
}
const queries = [
  'c',
  'cu',
  'cud',
  'cuda',
  'CUDA ',
  'cuda m',
  'cuda me',
  'cuda mem',
  'cuda memo',
  'cuda memory',
  'cuda',
  'numerical',
  'absent',
  '',
];
for (const query of queries) assert.deepEqual(index.filter(query), fullScan(query));
function measure(filter) {
  filter('');
  const start = performance.now();
  for (const query of queries) filter(query);
  return performance.now() - start;
}
const before = [];
const after = [];
// Warm up both paths before alternating measurement order.
measure(fullScan);
measure(index.filter);
for (let i = 0; i < samples; i++) {
  if (i % 2) {
    after.push(measure(index.filter));
    before.push(measure(fullScan));
  } else {
    before.push(measure(fullScan));
    after.push(measure(index.filter));
  }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
console.log(
  JSON.stringify(
    {
      documents: count,
      queriesPerSample: queries.length,
      samples,
      fullScanMedianMs: median(before),
      narrowedMedianMs: median(after),
      speedup: median(before) / median(after),
    },
    null,
    2,
  ),
);
