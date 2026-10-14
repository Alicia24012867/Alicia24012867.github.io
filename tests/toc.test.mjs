import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeHTML } from 'entities';
import { compileArticle } from '../scripts/content/compile.mjs';
import { createSuffixer } from '../scripts/content/text.mjs';

function assertHeadingTargets(article) {
  const ids = [...article.html.matchAll(/\bid="([^"]+)"/g)].map((match) => decodeHTML(match[1]));
  assert.equal(ids.length, new Set(ids).size, 'Article anchors must be unique');
  for (const heading of article.headings) {
    const target = [...article.html.matchAll(/<h([23]) id="([^"]+)">/g)].find(
      (match) => decodeHTML(match[2]) === heading.id,
    );
    assert.ok(target, `Missing TOC target: ${heading.id}`);
    assert.equal(Number(target[1]), heading.level);
    assert.equal(decodeURIComponent(encodeURIComponent(heading.id)), heading.id);
  }
}

test('TOC follows h2/h3 document order with readable inline text and excludes h4/code/footnotes', () => {
  const article = compileArticle(
    [
      '# Title',
      '## 中文 **标题** & `code`',
      '### Child *heading*[^note]',
      '#### Detail outside the TOC',
      '```html\n<h2>Example, not a heading</h2>\n```',
      '## Last',
      '[^note]: Footnote text.',
    ].join('\n\n'),
    'toc.md',
  );
  assert.deepEqual(article.headings, [
    { id: 'section-中文-标题-code', text: '中文 标题 & code', level: 2 },
    { id: 'section-child-heading', text: 'Child heading', level: 3 },
    { id: 'section-last', text: 'Last', level: 2 },
  ]);
  assertHeadingTargets(article);
});

test('TOC anchors stay deterministic for repeated Chinese headings, punctuation and missing parents', () => {
  const source = '# Title\n\n### 重复标题\n\n## 重复标题\n\n### 重复标题\n\n## !!!\n\n### ???';
  const article = compileArticle(source, 'toc.md');
  assert.deepEqual(
    article.headings.map((heading) => heading.id),
    [
      'section-重复标题',
      'section-重复标题-2',
      'section-重复标题-3',
      'section-heading',
      'section-heading-2',
    ],
  );
  assert.deepEqual(compileArticle(source, 'toc.md').headings, article.headings);
  assertHeadingTargets(article);
});

test('generated anchors preserve later custom ids and avoid non-heading and page anchors', () => {
  const article = compileArticle(
    '<h2>Intro</h2><h2 id="section-intro">Custom</h2><h3 id="section-intro">Repeated</h3><p id="section-next">Paragraph</p><h2>Next</h2><h2 id="main">Reserved</h2>',
    'toc.html',
  );
  assert.deepEqual(
    article.headings.map((heading) => heading.id),
    ['section-intro-2', 'section-intro', 'section-intro-3', 'section-next-2', 'main-2'],
  );
  assertHeadingTargets(article);
});

test('HTML entities in custom ids are decoded before deduplication and escaped on output', () => {
  const article = compileArticle(
    '<h2 id="a&amp;b">One</h2><h3 id="a&#38;b">Two</h3><h2 id="引号&quot;&amp;">Three</h2>',
    'toc.html',
  );
  assert.deepEqual(
    article.headings.map((heading) => heading.id),
    ['a&b', 'a&b-2', '引号"&'],
  );
  assertHeadingTargets(article);
});

test('heading anchors cannot steal footnote references or definitions', () => {
  const article = compileArticle(
    '<h2 id="fn-note">Heading</h2>\n\n<h3 id="fnref-note-1">Child</h3>\n\nText[^note].\n\n[^note]: Note.',
    'toc.md',
  );
  assert.deepEqual(
    article.headings.map((heading) => heading.id),
    ['fn-note-2', 'fnref-note-1-2'],
  );
  assert.match(article.html, /<li id="fn-note">/);
  assert.match(article.html, /<sup class="footnote-ref" id="fnref-note-1">/);
  assertHeadingTargets(article);
});

test('suffixed anchors match a fresh scan from -2 for any sequence of bases', () => {
  // Bases also collide with one another's suffixed forms, e.g. "a-2" and "a" + "-2".
  const bases = Array.from(
    { length: 600 },
    (_, i) => ['a', 'a-2', 'b', 'a-2-2', 'b-3'][(i % 7) % 5],
  );
  const naive = new Set();
  const taken = new Set();
  const suffixed = createSuffixer((anchor) => taken.has(anchor));
  for (const base of bases) {
    let expected = base;
    for (let suffix = 2; naive.has(expected); suffix++) expected = `${base}-${suffix}`;
    naive.add(expected);
    const anchor = taken.has(base) ? suffixed(base) : base;
    taken.add(anchor);
    assert.equal(anchor, expected);
  }
});

test('long runs of repeated headings and colliding footnote labels keep sequential anchors', () => {
  const repeats = 300;
  const article = compileArticle(
    [
      '# Title',
      ...Array.from({ length: repeats }, () => '## Example'),
      '<h2 id="section-example-7">Authored later</h2>',
      'See[^x], [^x!], [^x 2] and [^x?].',
      '[^x]: One.\n[^x!]: Two.\n[^x 2]: Three.\n[^x?]: Four.',
    ].join('\n\n'),
    'toc.md',
  );
  // Generated repeats skip the id a later heading authored, which keeps it.
  assert.deepEqual(
    article.headings.map((heading) => heading.id),
    [
      'section-example',
      ...Array.from({ length: repeats - 1 }, (_, i) => `section-example-${i < 5 ? i + 2 : i + 3}`),
      'section-example-7',
    ],
  );
  for (const anchor of ['x', 'x-2', 'x-2-2', 'x-3'])
    assert.ok(article.html.includes(`<li id="fn-${anchor}">`), `Missing footnote ${anchor}`);
  assertHeadingTargets(article);
});

test('articles without meaningful h2/h3 headings have no directory entries', () => {
  for (const [source, filename] of [
    ['# Title\n\nJust a paragraph.', 'plain.md'],
    ['<h1>Title</h1><h2> </h2><h3></h3><h4>Detail</h4>', 'plain.html'],
  ]) {
    const article = compileArticle(source, filename);
    assert.deepEqual(article.headings, []);
  }
});
