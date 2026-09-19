import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildArticleCatalog, catalogModule } from './articles/catalog.mjs';

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
    '_private/note.md': 'Private.', '.hidden.md': 'Hidden.', 'README.md': 'Docs.',
  });
  const watched = [];
  const { articles } = buildArticleCatalog(root, file => watched.push(file));
  assert.deepEqual(articles.map(article => article.slug), ['2026/new', 'old']);
  assert.ok(watched.includes(path.join(root, 'draft.md')));
  assert.doesNotMatch(JSON.stringify(articles), /Secret|Private|Hidden|Docs/);
});

test('catalog validates article links, missing targets and unpublished targets', (t) => {
  const good = fixture(t, { 'a.md': '[Next](./nested/b.html#intro)', 'nested/b.html': '<h2 id="intro">B</h2>' });
  assert.match(buildArticleCatalog(good).articles[0].html, /post=nested%2Fb#intro/);
  const missing = fixture(t, { 'a.md': '[Missing](./missing.md)' });
  assert.throws(() => buildArticleCatalog(missing), /不存在或未发布/);
  const draft = fixture(t, { 'a.md': '[Draft](./draft.md)', 'draft.md': '---\ndraft: true\n---\nNot public.' });
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
  const root = fixture(t, { 'a.md': '![One](./assets/image.svg)\n\n![Two](./assets/image.svg)', 'assets/image.svg': '<svg xmlns="http://www.w3.org/2000/svg" />' });
  const catalog = buildArticleCatalog(root);
  assert.equal(catalog.assets.size, 1);
  const module = catalogModule(catalog);
  assert.match(module, /import asset0 from .*image.svg\?url/);
  assert.doesNotMatch(module, /import asset1/);
  assert.match(module, /export default articles/);
});

test('symlink attachments cannot expose files outside the articles root', (t) => {
  const outside = fixture(t, { 'secret.txt': 'Not a public article asset.' });
  const root = fixture(t, { 'a.md': '[Attachment](./escape.txt)' });
  symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'escape.txt'));
  assert.throws(() => buildArticleCatalog(root), /不可越过 articles/);
});
