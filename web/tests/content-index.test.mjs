import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bodyLookup,
  createContentFilter,
  createContentIndex,
  excerptOf,
  matchesIn,
} from '../src/content/search.ts';

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

test('browsing builds lookups without reading search fields, then normalizes each entry once', () => {
  let titleReads = 0;
  let bodyReads = 0;
  const entry = {
    ...articles[0],
    get title() {
      titleReads++;
      return 'CUDA API';
    },
  };
  const body = {
    get [entry.slug]() {
      bodyReads++;
      return 'Synchronization';
    },
  };
  const index = createContentIndex([entry], (article) => article.section, labels, body);
  assert.equal(index.bySlug.get(entry.slug), entry);
  assert.equal(index.filter('  '), index.groups);
  assert.equal(titleReads, 0);
  assert.equal(bodyReads, 0);
  assert.deepEqual(index.filter('synchronization').get('learn'), [entry]);
  for (const query of ['cuda', 'absent', '', 'api']) index.filter(query);
  assert.equal(titleReads, 1);
  assert.equal(bodyReads, 1);
});

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

test('full-text search reuses browsing groups without inheriting a narrowed metadata result', () => {
  const index = createContentIndex(articles, (article) => article.section, labels);
  const original = [...index.groups].map(([group, entries]) => [group, [...entries]]);
  const metadataResult = index.filter('absent');
  const fullText = createContentFilter(
    index.groups,
    labels,
    Object.fromEntries(articles.map((article) => [article.slug, article.searchText])),
  );
  assert.equal(fullText(' '), index.groups);
  assert.deepEqual(fullText('synchronization').get('learn'), [articles[0]]);
  assert.deepEqual(fullText('allocations').get('learn'), [articles[2]]);
  assert.equal(index.filter('absent'), metadataResult);
  assert.deepEqual(index.filter('synchronization').get('learn'), []);
  assert.deepEqual(fullText('sea').get('life'), [articles[1]]);
  assert.deepEqual([...index.groups], original);
  assert.equal(fullText(''), index.groups);
});

test('separate metadata and body text match exactly like one joined, lowercased string', () => {
  const entries = [
    { slug: 'sigma', section: 'learn', title: 'ΟΔΟΣ Map', description: 'Ends ΣΑ', tags: ['GPU'] },
    { slug: 'unlabelled', section: 'other', title: 'B', description: '', tags: [] },
    { slug: 'no-body', section: 'life', title: 'C', description: 'Sea  day', tags: ['x y'] },
  ];
  const body = { sigma: 'Body ΣTARTS here', unlabelled: 'ünïcode body 正文 Text' };
  const groups = new Map(entries.map((entry) => [entry.section, [entry]]));
  const joined = entries.map((entry) =>
    [
      entry.title,
      entry.description,
      ...entry.tags,
      labels.get(entry.section),
      Object.hasOwn(body, entry.slug) ? body[entry.slug] : '',
    ]
      .join(' ')
      .toLowerCase(),
  );
  // Every short substring, including those that cross the joins and repeated spaces.
  const queries = new Set(['', ' ', 'map learning body', 'learning body', 'b  ü', 'life ']);
  for (const text of joined)
    for (let start = 0; start < text.length; start++)
      for (let end = start + 1; end <= Math.min(text.length, start + 12); end++)
        queries.add(text.slice(start, end));
  const filter = createContentFilter(groups, labels, body);
  for (const query of queries) {
    const needle = query.trim().toLowerCase();
    const expected = entries.filter((_, index) => joined[index].includes(needle));
    const found = [...filter(query).values()].flat();
    assert.deepEqual(found, expected, JSON.stringify(query));
  }
});

test('independent filters share immutable groups and normalize only when first searched', () => {
  let reads = 0;
  const entry = Object.freeze({
    ...articles[0],
    get title() {
      reads++;
      return 'CUDA API';
    },
  });
  const groups = new Map([['learn', Object.freeze([entry])]]);
  const filter = createContentFilter(groups, labels, { [entry.slug]: 'Full text' });
  assert.equal(filter(''), groups);
  assert.equal(reads, 0);
  assert.deepEqual(filter('full').get('learn'), [entry]);
  assert.deepEqual(filter('full text').get('learn'), [entry]);
  assert.deepEqual(filter('missing').get('learn'), []);
  assert.equal(filter(''), groups);
  assert.equal(reads, 1);
  assert.equal(createContentFilter(new Map(), labels)('anything').size, 0);
});

test('full text keeps its case and is matched in place, symbols and all', () => {
  const entries = [
    { slug: 'step', section: 'learn', title: 'Timestep', description: '', tags: [] },
    { slug: 'math', section: 'learn', title: 'Taylor', description: '', tags: [] },
  ];
  const body = {
    step: 'Call CKTtrunc(ckt, &newDelta) after DCtran. 步长控制',
    math: 'The error is O($h^3$) / h = O($h^2$) and (k+1)! grows. a.b',
  };
  const filter = createContentFilter(new Map([['learn', entries]]), labels, body);
  const found = (query) =>
    filter(query)
      .get('learn')
      .map((entry) => entry.slug);
  assert.deepEqual(found('ckttrunc(ckt'), ['step']);
  assert.deepEqual(found('DCTRAN'), ['step']);
  assert.deepEqual(found('步长'), ['step']);
  // Pattern characters in a query are only themselves.
  assert.deepEqual(found('(k+1)!'), ['math']);
  assert.deepEqual(found('$h^3$'), ['math']);
  assert.deepEqual(found('a.b'), ['math']);
  assert.deepEqual(found('a*b'), []);
  assert.deepEqual(found('[k]'), []);
  // A query can still run on from the section name into the text.
  assert.deepEqual(found('learning call ckt'), ['step']);
  assert.equal(body.step, 'Call CKTtrunc(ckt, &newDelta) after DCtran. 步长控制');
});

test('titles mark every match of the query, whatever its case', () => {
  assert.deepEqual(matchesIn('CUDA memory and cuda streams', ' Cuda '), [
    [0, 4],
    [16, 20],
  ]);
  assert.deepEqual(matchesIn('写在20岁前', '20岁'), [[2, 5]]);
  assert.deepEqual(matchesIn('O(h^2) error', 'h^2)'), [[2, 6]]);
  assert.deepEqual(matchesIn('anything', '  '), []);
  assert.deepEqual(matchesIn('aaaa', 'aa'), [
    [0, 2],
    [2, 4],
  ]);
});

test('an excerpt shows the first match with whole words around it', () => {
  const body =
    'Numerical integration needs a step size. The local truncation error decides whether the step is accepted, and reltol scales the tolerance for every node in the circuit before the next step is tried. Rejected steps shrink by a factor of eight, and accepted ones may grow while the error stays well below the tolerance.';
  const excerpt = excerptOf(body, 'RELTOL');
  assert.equal(excerpt.text.slice(...excerpt.match), 'reltol');
  assert.ok(excerpt.before && excerpt.after);
  assert.ok(!excerpt.text.startsWith(' ') && !excerpt.text.endsWith(' '));
  // The window begins and ends between words.
  assert.equal(body[body.indexOf(excerpt.text) - 1], ' ');
  assert.equal(body[body.indexOf(excerpt.text) + excerpt.text.length], ' ');
  assert.ok(excerpt.match[0] <= 24);
  const start = excerptOf(body, 'numerical');
  assert.deepEqual(start.match, [0, 9]);
  assert.equal(start.before, false);
  const chinese = excerptOf('一'.repeat(40) + '步长控制' + '二'.repeat(200), '步长');
  assert.equal(chinese.text.length, 24 + 2 + 140);
  assert.equal(chinese.text.slice(...chinese.match), '步长');
  assert.equal(excerptOf(body, 'absent'), undefined);
  assert.equal(excerptOf(body, ' '), undefined);
  // An emoji at either edge is never cut in half.
  const emoji = excerptOf('😀'.repeat(20) + 'x' + '😀'.repeat(80), 'x', { before: 5, after: 5 });
  assert.equal(emoji.text, '😀😀x😀😀');
});

test('only a document of its own name has full text', () => {
  const bodyOf = bodyLookup({ constructor: 'A formula', note: 'Text' });
  assert.equal(bodyOf('note'), 'Text');
  assert.equal(bodyOf('constructor'), 'A formula');
  assert.equal(bodyOf('toString'), '');
  assert.equal(createContentIndex([], () => 'x', labels).bodyOf('hasOwnProperty'), '');
});
