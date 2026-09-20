import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import childProcess, { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  realpathSync,
  renameSync,
  utimesSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildArticleCatalog } from '../scripts/content/catalog.mjs';
import { articleModule } from '../scripts/content/modules.mjs';

function fixture(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), 'alicia-articles-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, contents] of Object.entries(files)) {
    const absolute = path.join(root, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return realpathSync(root);
}

test('catalog discovers nested articles, excludes drafts/private files and sorts deterministically', (t) => {
  const root = fixture(t, {
    'old.md': '---\ndate: 2026-01-01\n---\nOld.',
    '2026/new.html': '---\ndate: 2026-02-01\nsection: life\n---\n<p>New.</p>',
    'draft.md': '---\ndraft: true\n---\nSecret.',
    '_private/note.md': 'Private.',
    '.hidden.md': 'Hidden.',
    'README.md': 'Docs.',
  });
  const watched = [];
  const { articles } = buildArticleCatalog(root, (file) => watched.push(file));
  assert.deepEqual(
    articles.map((article) => article.slug),
    ['2026/new', 'old'],
  );
  assert.ok(watched.includes(path.join(root, 'draft.md')));
  assert.doesNotMatch(JSON.stringify(articles), /Secret|Private|Hidden|Docs/);
});

test('catalog validates article links, missing targets and unpublished targets', (t) => {
  const good = fixture(t, {
    'a.md': '[Next](./nested/b.html#intro)',
    'nested/b.html': '<h2 id="intro">B</h2>',
  });
  assert.match(buildArticleCatalog(good).articles[0].html, /post=nested%2Fb#intro/);
  const missing = fixture(t, { 'a.md': '[Missing](./missing.md)' });
  assert.throws(() => buildArticleCatalog(missing), /不存在或未发布/);
  const draft = fixture(t, {
    'a.md': '[Draft](./draft.md)',
    'draft.md': '---\ndraft: true\n---\nNot public.',
  });
  assert.throws(() => buildArticleCatalog(draft), /不存在或未发布/);
});

test('catalog rejects duplicate slugs and missing or executable attachments', (t) => {
  const duplicate = fixture(t, { 'same.md': 'One.', 'same.html': '<p>Two.</p>' });
  assert.throws(() => buildArticleCatalog(duplicate), /文章地址重复/);
  const missing = fixture(t, { 'a.md': '![Missing](./no.webp)' });
  assert.throws(() => buildArticleCatalog(missing), /找不到文章附件/);
  const script = fixture(t, { 'a.md': '[Script](./unsafe.cjs)', 'unsafe.cjs': 'alert(1)' });
  assert.throws(() => buildArticleCatalog(script), /不能引用文章源码或脚本/);
});

test('attachments are deduplicated and module generation delegates their URLs to Vite', (t) => {
  const root = fixture(t, {
    'a.md': '![One](./assets/image.svg)\n\n![Two](./assets/image.svg)',
    'assets/image.svg': '<svg xmlns="http://www.w3.org/2000/svg" />',
  });
  const catalog = buildArticleCatalog(root);
  assert.equal(catalog.assets.size, 1);
  const module = articleModule(
    catalog.articles[0],
    new Map([...catalog.assets].map(([file, marker]) => [marker, file])),
  );
  assert.match(module, /import asset0 from .*image.svg\?url/);
  assert.doesNotMatch(module, /import asset1/);
  assert.match(module, /export default body/);
});

test('symlink attachments cannot expose files outside the articles root', (t) => {
  const outside = fixture(t, { 'secret.txt': 'Not a public article asset.' });
  const root = fixture(t, { 'a.md': '[Attachment](./escape.txt)' });
  symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'escape.txt'));
  assert.throws(() => buildArticleCatalog(root), /不可越过 articles/);
});

test('backlinks are deduplicated, stay within their collection, and ignore self-links and drafts', (t) => {
  const root = fixture(t, {
    'target.md': '# Target\n\n[Self](target.md)',
    'first.md': '[Target](target.md)\n\n[Again](target.md#heading)',
    'second.html': '<a href="?q=x&amp;post=target">Query link</a>',
    'third.md': '[Root](/notes/?post=target)',
    'cross.md': '[Blog](/blog/?post=target)\n\n[External](https://example.com/notes/?post=target)',
    'draft.md': '---\ndraft: true\n---\n[Target](target.md)',
  });
  const catalog = buildArticleCatalog(root, undefined, { basePath: '/notes/' });
  assert.deepEqual(catalog.articles.find((article) => article.slug === 'target').backlinks, [
    'first',
    'second',
    'third',
  ]);
  assert.ok(
    catalog.articles.every(
      (article) => article.slug === 'target' || article.backlinks.length === 0,
    ),
  );
});

test('search text includes readable prose, code and formulas without generated controls or markup', (t) => {
  const root = fixture(t, {
    'note.md':
      '# Title\n\nOnlyBodyToken &amp; 中文\n\n```cpp\ncudaDeviceSynchronize();\n```\n\n$E=mc^2$\n\nA footnote[^n].\n\n[^n]: FootnoteToken.',
  });
  const article = buildArticleCatalog(root).articles[0];
  assert.match(article.searchText, /onlybodytoken & 中文/);
  assert.match(article.searchText, /cudadevicesynchronize/);
  assert.match(article.searchText, /footnotetoken/);
  assert.match(article.searchText, /e/);
  assert.doesNotMatch(article.searchText, /<[^>]+>|copy code|hljs|__ALICIA/i);
});

test('generated catalogs replace every attachment marker and escape URLs for HTML attributes', async () => {
  const assets = new Map([
    ['/one.svg', '__ALICIA_ARTICLE_ASSET_0__'],
    ['/two.svg', '__ALICIA_ARTICLE_ASSET_1__'],
  ]);
  const urls = ['https://example.com/one?a=1&b="two"', '/two.svg'];
  const source = articleModule(
    {
      html: '<img src="__ALICIA_ARTICLE_ASSET_0__"><a href="__ALICIA_ARTICLE_ASSET_1__">File</a><img src="__ALICIA_ARTICLE_ASSET_0__">',
    },
    new Map([...assets].map(([file, marker]) => [marker, file])),
  ).replace(
    /import asset(\d+) from [^;]+;/g,
    (_, index) => `const asset${index} = ${JSON.stringify(urls[index])};`,
  );
  const { default: body } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  assert.equal(
    body.html,
    '<img src="https://example.com/one?a=1&amp;b=&quot;two&quot;"><a href="/two.svg">File</a><img src="https://example.com/one?a=1&amp;b=&quot;two&quot;">',
  );
});

test('incremental compilation reuses unchanged sources, remaps assets, and revalidates deleted targets', (t) => {
  const root = fixture(t, {
    'a.md': '# A\n\n![A](one.svg)\n\n[B](b.md)',
    'b.md': '# B\n\n![B](two.svg)',
    'one.svg': '<svg/>',
    'two.svg': '<svg/>',
  });
  const cache = new Map();
  const build = () => buildArticleCatalog(root, undefined, { cache });
  const first = build();
  const cachedA = cache.get(path.join(root, 'a.md'));
  const cachedB = cache.get(path.join(root, 'b.md'));
  assert.deepEqual(build(), first);
  assert.equal(cache.get(path.join(root, 'a.md')), cachedA);
  writeFileSync(path.join(root, 'b.md'), '# B revised\n\n![B](two.svg)');
  const next = build();
  assert.equal(cache.get(path.join(root, 'a.md')), cachedA);
  assert.notEqual(cache.get(path.join(root, 'b.md')), cachedB);
  assert.match(next.articles.find((article) => article.slug === 'a').html, /ASSET_0/);
  assert.match(next.articles.find((article) => article.slug === 'b').html, /ASSET_1/);
  assert.deepEqual(next.articles.find((article) => article.slug === 'b').backlinks, ['a']);
  rmSync(path.join(root, 'two.svg'));
  assert.throws(build, /找不到文章附件/);
  writeFileSync(path.join(root, 'two.svg'), '<svg/>');
  rmSync(path.join(root, 'b.md'));
  assert.throws(build, /不存在或未发布/);
  assert.equal(cache.has(path.join(root, 'b.md')), false);
});

test('watcher change sets reread only edited documents and still validate attachments', (t) => {
  const root = fixture(t, {
    'a.md': '# A\n\n![A](one.svg)\n\n[B](nested/b.md)',
    'nested/b.md': '# B',
    'one.svg': '<svg/>',
  });
  const cache = new Map();
  buildArticleCatalog(root, undefined, { cache });
  const reads = [];
  const read = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (file, ...args) => {
    reads.push(path.relative(root, file));
    return read(file, ...args);
  });
  writeFileSync(path.join(root, 'nested/b.md'), '# C');
  const changedFiles = new Set(['nested/b.md']);
  const catalog = buildArticleCatalog(root, undefined, { cache, changedFiles });
  assert.deepEqual(reads, ['nested/b.md']);
  assert.equal(catalog.articles.find((article) => article.slug === 'nested/b').title, 'C');
  assert.deepEqual(catalog.articles.find((article) => article.slug === 'nested/b').backlinks, [
    'a',
  ]);
  rmSync(path.join(root, 'one.svg'));
  assert.throws(
    () => buildArticleCatalog(root, undefined, { cache, changedFiles: new Set(['one.svg']) }),
    /找不到文章附件/,
  );
});

test('cached backlink targets follow source edits and collection base changes', (t) => {
  const root = fixture(t, {
    'a.md': '# A\n\n[B](/notes/?post=b)',
    'b.md': '# B',
  });
  const cache = new Map();
  const build = (basePath, changedFiles) =>
    buildArticleCatalog(root, undefined, { cache, basePath, changedFiles });
  const incoming = (catalog) => catalog.articles.find((article) => article.slug === 'b').backlinks;
  assert.deepEqual(incoming(build('/notes/')), ['a']);
  assert.deepEqual(incoming(build('/blog/', new Set())), []);
  assert.deepEqual(incoming(build('/notes/', new Set())), ['a']);
  writeFileSync(path.join(root, 'a.md'), '# A\n\nNo link now.');
  assert.deepEqual(incoming(build('/notes/', new Set(['a.md']))), []);
  writeFileSync(path.join(root, 'a.md'), '# A\n\n[B](b.md)');
  assert.deepEqual(incoming(build('/notes/')), ['a'], 'Standalone builds detect unreported edits');
});

test('discovery prunes private directories and retains nested and symlink file behavior', (t) => {
  const root = fixture(t, {
    'nested/a.md': '# A',
    '_private/deep/secret.md': '# Secret',
    '.hidden/deep/secret.md': '# Secret',
    'directory.md/b.md': '# B',
  });
  symlinkSync(path.join(root, 'nested/a.md'), path.join(root, 'alias.md'));
  symlinkSync(path.join(root, 'nested'), path.join(root, 'linked-directory.md'));
  const readDirectory = fs.readdirSync;
  const directories = [];
  t.mock.method(fs, 'readdirSync', (directory, ...args) => {
    directories.push(path.relative(root, directory));
    return readDirectory(directory, ...args);
  });
  const catalog = buildArticleCatalog(root);
  assert.deepEqual(
    catalog.articles.map((article) => article.slug),
    ['alias', 'directory.md/b', 'nested/a'],
  );
  assert.deepEqual(directories.sort(), ['', 'directory.md', 'nested']);
  const outside = fixture(t, { 'secret.md': '# Outside' });
  rmSync(path.join(root, 'alias.md'));
  symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'alias.md'));
  assert.throws(() => buildArticleCatalog(root), /不可越过 articles/);
});

test('shared attachments are checked once per build and symlink changes are revalidated', (t) => {
  const root = fixture(t, {
    'a.md': '![A](shared.svg)',
    'b.md': '![B](shared.svg)',
    'shared.svg': '<svg/>',
  });
  const stat = fs.statSync;
  let checks = 0;
  t.mock.method(fs, 'statSync', (file, ...args) => {
    if (file === path.join(root, 'shared.svg')) checks++;
    return stat(file, ...args);
  });
  const cache = new Map();
  const watched = [];
  buildArticleCatalog(root, (file) => watched.push(file), { cache });
  assert.equal(checks, 1);
  assert.equal(watched.filter((file) => file === path.join(root, 'shared.svg')).length, 1);
  const outside = fixture(t, { 'image.svg': '<svg/>' });
  rmSync(path.join(root, 'shared.svg'));
  symlinkSync(path.join(outside, 'image.svg'), path.join(root, 'shared.svg'));
  assert.throws(
    () => buildArticleCatalog(root, undefined, { cache, changedFiles: new Set() }),
    /不可越过 articles/,
  );
});

function repository(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'alicia-dates-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (args, timestamp) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Content test',
        GIT_AUTHOR_EMAIL: 'content@example.invalid',
        GIT_COMMITTER_NAME: 'Content test',
        GIT_COMMITTER_EMAIL: 'content@example.invalid',
        ...(timestamp ? { GIT_AUTHOR_DATE: timestamp, GIT_COMMITTER_DATE: timestamp } : {}),
      },
    });
  git(['init']);
  const commit = (timestamp) => {
    git(['add', '.']);
    git(['-c', 'commit.gpgsign=false', 'commit', '-m', 'Content change'], timestamp);
  };
  return { root, git, commit };
}

test('Git supplies stable publication dates and same-day edits while ignoring moves and unrelated commits', (t) => {
  const { root, commit } = repository(t);
  let directory = path.join(root, 'legacy');
  mkdirSync(directory);
  writeFileSync(path.join(directory, '中文 note.md'), '# First version');
  commit('2026-09-19T10:00:00+08:00');
  const cache = new Map();
  const read = () => buildArticleCatalog(directory, undefined, { cache }).articles[0];
  assert.equal(read().date, '2026-09-19T10:00:00+08:00');
  assert.equal(read().updated, '');

  writeFileSync(path.join(directory, '中文 note.md'), '# First version\n\nA revision.');
  commit('2026-09-19T11:00:00+08:00');
  assert.equal(read().date, '2026-09-19T10:00:00+08:00');
  assert.equal(read().updated, '2026-09-19T11:00:00+08:00');

  mkdirSync(path.join(root, 'content'));
  renameSync(directory, path.join(root, 'content/notes'));
  directory = path.join(root, 'content/notes');
  commit('2026-09-20T12:00:00+08:00');
  writeFileSync(path.join(root, 'unrelated.txt'), 'Not an article edit');
  commit('2026-09-21T12:00:00+08:00');
  const moved = read();
  assert.equal(moved.date, '2026-09-19T10:00:00+08:00');
  assert.equal(moved.updated, '2026-09-19T11:00:00+08:00');
  utimesSync(path.join(directory, '中文 note.md'), new Date(), new Date());
  assert.deepEqual(read(), moved, 'Checkout timestamps do not change published metadata');

  writeFileSync(path.join(directory, '中文 note.md'), '# First version\n\nUncommitted edit.');
  assert.equal(read().updated, moved.updated);
  commit('2026-09-22T08:00:00+08:00');
  assert.equal(read().updated, '2026-09-22T08:00:00+08:00');
});

test('an earlier explicit publication date and a pure rename do not manufacture an edit', (t) => {
  const { root, commit } = repository(t);
  writeFileSync(path.join(root, 'before.html'), '---\ndate: 2026-09-01\n---\n<p>First</p>');
  commit('2026-09-19T10:00:00+08:00');
  renameSync(path.join(root, 'before.html'), path.join(root, 'after.html'));
  commit('2026-09-20T10:00:00+08:00');
  const article = buildArticleCatalog(root).articles[0];
  assert.equal(article.date, '2026-09-01');
  assert.equal(article.updated, '');
});

test('date overrides work for Markdown and HTML, including same-day editing and date order validation', (t) => {
  const { root } = repository(t);
  for (const extension of ['md', 'html']) {
    const file = path.join(root, `article.${extension}`);
    writeFileSync(file, '---\ndate: 2026-09-19\nupdated: 2026-09-19\n---\nText');
    const article = buildArticleCatalog(root).articles[0];
    assert.equal(article.date, '2026-09-19');
    assert.equal(article.updated, '2026-09-19');
    writeFileSync(file, '---\ndate: 2026-09-19\nupdated: 2026-09-18\n---\nText');
    assert.throws(() => buildArticleCatalog(root), /updated 不可早于 date/);
    rmSync(file);
  }
});

test('untracked articles get a local publication date without an invented edit date', (t) => {
  const { root } = repository(t);
  writeFileSync(path.join(root, 'new.md'), '# New note');
  const { date, updated } = buildArticleCatalog(root).articles[0];
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(updated, '');
});

test('one history scan serves both collections, refreshes after commits, and explicit dates skip Git', (t) => {
  const { root, commit } = repository(t);
  for (const collection of ['blog', 'notes']) {
    mkdirSync(path.join(root, collection));
    for (let index = 0; index < 20; index++)
      writeFileSync(path.join(root, collection, `${index}.md`), `# Note ${index}`);
  }
  commit('2026-09-19T10:00:00+08:00');
  const calls = [];
  t.mock.method(childProcess, 'execFileSync', (command, args, options) => {
    calls.push(args[0]);
    return execFileSync(command, args, options);
  });
  const read = (collection) => buildArticleCatalog(path.join(root, collection));
  read('blog');
  read('notes');
  read('blog');
  assert.equal(calls.filter((command) => command === 'log').length, 1);
  assert.equal(calls.filter((command) => command === 'rev-parse').length, 3);

  writeFileSync(path.join(root, 'notes/0.md'), '# Note 0\n\nChanged');
  commit('2026-09-20T10:00:00+08:00');
  assert.equal(read('notes').articles[0].updated, '2026-09-20T10:00:00+08:00');
  read('blog');
  assert.equal(calls.filter((command) => command === 'log').length, 2);

  const explicit = fixture(t, {
    'note.md': '---\ndate: 2026-09-19\nupdated: 2026-09-20\n---\n# Explicit',
    'draft.md': '---\ndraft: true\n---\n# Draft',
  });
  calls.length = 0;
  buildArticleCatalog(explicit);
  assert.deepEqual(calls, []);
});

test('batched history handles multiple renames, unusual paths, mode-only changes, and recreation', (t) => {
  const { root, commit } = repository(t);
  const first = 'a\t中文\n.md';
  writeFileSync(path.join(root, first), 'First article\n'.repeat(10));
  commit('2026-09-18T10:00:00+08:00');
  writeFileSync(path.join(root, 'b.md'), 'Second article\n'.repeat(10));
  commit('2026-09-19T10:00:00+08:00');
  renameSync(path.join(root, 'b.md'), path.join(root, 'c.md'));
  renameSync(path.join(root, first), path.join(root, 'renamed.md'));
  commit('2026-09-20T10:00:00+08:00');
  const read = () =>
    new Map(buildArticleCatalog(root).articles.map((article) => [article.slug, article]));
  assert.equal(read().get('renamed').date, '2026-09-18T10:00:00+08:00');
  assert.equal(read().get('c').date, '2026-09-19T10:00:00+08:00');
  chmodSync(path.join(root, 'renamed.md'), 0o755);
  commit('2026-09-21T10:00:00+08:00');
  assert.equal(read().get('renamed').updated, '');
  renameSync(path.join(root, 'renamed.md'), path.join(root, 'edited.md'));
  fs.appendFileSync(path.join(root, 'edited.md'), 'A revision.\n');
  commit('2026-09-22T10:00:00+08:00');
  assert.equal(read().get('edited').date, '2026-09-18T10:00:00+08:00');
  assert.equal(read().get('edited').updated, '2026-09-22T10:00:00+08:00');
  rmSync(path.join(root, 'c.md'));
  commit('2026-09-23T10:00:00+08:00');
  writeFileSync(path.join(root, 'c.md'), '# A new article at the old path');
  commit('2026-09-24T10:00:00+08:00');
  assert.equal(read().get('c').date, '2026-09-24T10:00:00+08:00');
  assert.equal(read().get('c').updated, '');
});

test('merge commits record when an article change reaches the current branch', (t) => {
  const { root, git, commit } = repository(t);
  writeFileSync(path.join(root, 'note.md'), '# Original');
  commit('2026-09-18T10:00:00+08:00');
  const branch = git(['branch', '--show-current']).trim();
  git(['checkout', '-b', 'edit']);
  writeFileSync(path.join(root, 'note.md'), '# Revised on another branch');
  commit('2026-09-19T10:00:00+08:00');
  git(['checkout', branch]);
  writeFileSync(path.join(root, 'unrelated.txt'), 'Main branch work');
  commit('2026-09-20T10:00:00+08:00');
  git(
    ['-c', 'commit.gpgsign=false', 'merge', '--no-ff', '--no-edit', 'edit'],
    '2026-09-21T10:00:00+08:00',
  );
  const article = buildArticleCatalog(root).articles[0];
  assert.equal(article.date, '2026-09-18T10:00:00+08:00');
  assert.equal(article.updated, '2026-09-21T10:00:00+08:00');
});
