import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { createContentFilter, createContentIndex } from '../src/content/search.ts';

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
// Each version searches the full text its build writes: the original case now. With
// --lowercase-text, the baseline gets the lowercased text that builds wrote before.
const lowercased = Object.fromEntries(
  Object.entries(text).map(([slug, value]) => [slug, value.toLowerCase()]),
);
const textFor = (variant) =>
  variant.name !== 'current' && process.argv.includes('--lowercase-text') ? lowercased : text;
const variants = [{ name: 'current', create: createContentIndex, filter: createContentFilter }];
const compareArg = process.argv.indexOf('--compare-ref');
if (compareArg !== -1) {
  const ref = process.argv[compareArg + 1];
  if (!ref || ref.startsWith('--')) throw new Error('--compare-ref requires a Git revision');
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', ref], {
    encoding: 'utf8',
  }).split('\n');
  const file = files.includes('src/content/search.ts')
    ? 'src/content/search.ts'
    : 'src/content/index.ts';
  const source = execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const baseline = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);
  variants.unshift({
    name: ref,
    create: baseline.createContentIndex,
    filter: baseline.createContentFilter,
  });
}
const build = (variant, body = {}) =>
  variant.create(articles, (article) => article.section, labels, body);
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
// Validate both implementations against independent substring matching outside timed sections.
const expected = queries.map((query) =>
  articles.filter((article) =>
    [
      article.title,
      article.description,
      ...article.tags,
      labels.get(article.section),
      text[article.slug],
    ]
      .join(' ')
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  ),
);
for (const variant of variants) {
  const index = build(variant, textFor(variant));
  queries.forEach((query, i) => assert.deepEqual(index.filter(query).get('learn'), expected[i]));
  variant.results = {
    listingMs: [],
    fullTextIndexMs: [],
    fullTextUpgradeMs: [],
    firstSearchMs: [],
    firstSearchTotalMs: [],
    warmQueriesMs: [],
  };
}
function measure(variant, record) {
  let start = performance.now();
  const listing = build(variant);
  const listingMs = performance.now() - start;
  start = performance.now();
  const upgraded = variant.filter
    ? { ...listing, filter: variant.filter(listing.groups, labels, textFor(variant)) }
    : build(variant, textFor(variant));
  const fullTextUpgradeMs = performance.now() - start;
  assert.equal(upgraded.bySlug.size, count);
  start = performance.now();
  const index = build(variant, textFor(variant));
  const fullTextIndexMs = performance.now() - start;
  start = performance.now();
  index.filter('cuda');
  const firstSearchMs = performance.now() - start;
  index.filter('');
  start = performance.now();
  for (const query of queries) index.filter(query);
  const warmQueriesMs = performance.now() - start;
  if (record) {
    const result = {
      listingMs,
      fullTextIndexMs,
      fullTextUpgradeMs,
      firstSearchMs,
      firstSearchTotalMs: fullTextIndexMs + firstSearchMs,
      warmQueriesMs,
    };
    for (const [key, value] of Object.entries(result)) variant.results[key].push(value);
  }
}
for (const variant of variants) measure(variant, false);
for (let i = 0; i < samples; i++)
  for (const variant of i % 2 ? [...variants].reverse() : variants) measure(variant, true);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
// With --expose-gc, also report the heap a full-text filter keeps after it has
// normalized every document.
function retainedBytes(variant) {
  const listing = build(variant);
  globalThis.gc();
  const before = process.memoryUsage().heapUsed;
  const index = variant.filter
    ? { filter: variant.filter(listing.groups, labels, textFor(variant)) }
    : build(variant, textFor(variant));
  index.filter('absent');
  globalThis.gc();
  const bytes = process.memoryUsage().heapUsed - before;
  assert.equal(index.filter('absent').get('learn').length, 0);
  return bytes;
}
if (typeof globalThis.gc === 'function')
  for (const variant of variants)
    variant.retained = median(Array.from({ length: 5 }, () => retainedBytes(variant)));
console.log(
  JSON.stringify(
    {
      documents: count,
      queriesPerSample: queries.length,
      samples,
      results: variants.map(({ name, results, retained }) => ({
        implementation: name,
        ...Object.fromEntries(
          Object.entries(results).map(([key, values]) => [key, median(values)]),
        ),
        ...(retained === undefined ? {} : { retainedFullTextBytes: retained }),
      })),
    },
    null,
    2,
  ),
);
