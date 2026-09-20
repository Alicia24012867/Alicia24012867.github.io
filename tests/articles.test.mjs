import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileArticle } from '../scripts/content/compile.mjs';

test('test.md renders real Markdown, a unique title, code, tables, tasks and local images', () => {
  const source = readFileSync(new URL('../content/blog/test.md', import.meta.url), 'utf8');
  const article = compileArticle(source, 'test.md', (asset) => `/built/${asset}`);
  assert.equal(article.slug, 'test');
  assert.equal(article.date, '2026-09-19');
  assert.equal(article.format, 'Markdown');
  assert.equal(article.section, 'learn');
  assert.match(article.html, /class="footnote-ref"/);
  assert.match(article.html, /class="article-footnotes"/);
  assert.ok(article.headings.length >= 6);
  assert.doesNotMatch(article.html, /<h1\b/);
  assert.match(article.html, /class="hljs-keyword"/);
  assert.match(article.html, /class="article-table"/);
  assert.match(article.html, /class="copy-code"/);
  assert.match(article.html, /class="katex"/);
  assert.match(article.html, /class="article-mermaid"/);
  assert.match(article.html, /type="checkbox" disabled/);
  assert.match(article.html, /src="\/built\/assets\/summer-sky.webp"/);
  assert.match(article.html, /<details>/);
});

test('HTML articles share metadata and headings, and remove document chrome and active content', () => {
  const article = compileArticle(
    '---\ntitle: HTML 示例\ndate: 2026-09-18\ntags: [HTML]\n---\n<!doctype html><html><head><title>不该显示</title><style>body{display:none}</style></head><body><h1>HTML 示例</h1><h2 id="intro">章节</h2><p style="color:red" onclick="alert(1)">正文</p><script>alert(1)</script><iframe src="https://example.com"></iframe><a href="javascript:alert(1)">链接</a></body></html>',
    'example.html',
  );
  assert.equal(article.title, 'HTML 示例');
  assert.equal(article.format, 'HTML');
  assert.deepEqual(article.headings, [{ id: 'intro', text: '章节', level: 2 }]);
  assert.match(article.html, /<p>正文<\/p>/);
  assert.doesNotMatch(
    article.html,
    /不该显示|display:none|onclick|style=|<script|<iframe|javascript:/,
  );
});

test('nested article links and attachments resolve under the article directory', () => {
  const article = compileArticle(
    '# Example\n\n[下一篇](../test.md#section-intro)\n\n![图](../assets/sky.webp)\n\n[PDF](./notes.pdf)\n\n![公共图](/images/summer-sky.webp)',
    '2026/note.md',
    (asset) => `../bundled/${asset}`,
  );
  assert.match(article.html, /href="\?post=test#section-intro"/);
  assert.match(article.html, /src="\.\.\/bundled\/assets\/sky.webp"/);
  assert.match(article.html, /href="\.\.\/bundled\/2026\/notes.pdf"/);
  assert.match(article.html, /src="\.\.\/images\/summer-sky.webp"/);
});

test('headings have stable unique anchors and metadata falls back to normal article content', () => {
  const article = compileArticle(
    '# Research & curiosity\n\nA small beginning.\n\n## 重复标题\n\nText\n\n## 重复标题',
    'a-note.md',
  );
  assert.equal(article.title, 'Research & curiosity');
  assert.equal(article.description, 'A small beginning.');
  assert.deepEqual(
    article.headings.map((heading) => heading.id),
    ['section-重复标题', 'section-重复标题-2'],
  );
});

test('markdown math is rendered after sanitizing, and dollar signs in code stay literal', () => {
  const article = compileArticle(
    '# Math\n\nEnergy $E=mc^2$ stays inline.\n\n$$\\alpha + \\beta$$\n\n```js\nconst price = "$5"\n```\n',
    'math.md',
  );
  assert.match(article.html, /class="katex"/);
  assert.match(article.html, /class="article-math"/);
  assert.match(article.html, /\$5/);
  assert.doesNotMatch(article.html, /ALICIA_MATH_PLACEHOLDER|\$E=mc\^2\$/);
});

test('mermaid fences become diagrams with escaped source, not executable HTML', () => {
  const article = compileArticle(
    '# Diagram\n\n```mermaid\nflowchart LR\n  A["<script>alert(1)</script>"] --> B\n```\n',
    'diagram.md',
  );
  assert.match(article.html, /class="article-mermaid"/);
  assert.match(article.html, /flowchart LR/);
  assert.match(article.html, /&lt;script&gt;/);
  assert.doesNotMatch(article.html, /<script|ALICIA_MATH_PLACEHOLDER/);
});

test('footnotes stay out of code, and article sections are a fixed list', () => {
  const footnoted = compileArticle(
    'See this[^1] and `[^skip]`.\n\n```js\nconst mark = "[^skip]";\n```\n\n[^1]: Safe <script>alert(1)</script> note.\n[^skip]: unused\n',
    'notes.md',
  );
  assert.match(footnoted.html, /class="footnote-ref"/);
  assert.match(footnoted.html, /Safe/);
  assert.match(footnoted.html, /\[(?:\^|&caret;)?skip\]|\[\^skip\]/);
  assert.doesNotMatch(footnoted.html, /<script/);
  assert.equal(
    compileArticle('---\nsection: 生活\n---\n# Life\n\nHello.', 'sky.md').section,
    'life',
  );
  assert.equal(compileArticle('# Default\n\nHello.', 'plain.md').section, 'learn');
  assert.throws(() => compileArticle('---\nsection: travel\n---\nText', 'wrong.md'), /learn|生活/);
});

test('drafts are excluded; invalid metadata and escaping paths fail clearly', () => {
  assert.equal(compileArticle('---\ndraft: true\n---\nPrivate draft', 'draft.md'), null);
  assert.throws(() => compileArticle('---\ndate: 2026-02-30\n---\nText', 'invalid.md'), /有效的/);
  assert.throws(() => compileArticle('---\ntags: hello\n---\nText', 'invalid.md'), /字符串列表/);
  assert.throws(() => compileArticle('---\ntitle: Broken\nText', 'invalid.md'), /缺少结束/);
  assert.throws(() => compileArticle('![secret](../../secrets.png)', 'note.md'), /不可越过/);
});

test('math and footnotes produce readable titles, summaries and stable heading ids', () => {
  const article = compileArticle(
    '# Energy $E=mc^2$\n\nAbout $x+y$.[^a]\n\n## More $x^2$\n\n[^a]: A note.',
    'math-title.md',
  );
  assert.equal(article.title, 'Energy E=mc^2');
  assert.equal(article.description, 'About x+y.');
  assert.deepEqual(article.headings, [{ id: 'section-more-x-2', text: 'More x^2', level: 2 }]);
  assert.doesNotMatch(
    JSON.stringify(article),
    /ALICIA_MATH_PLACEHOLDER|ALICIA_FNREF|data-math-index/,
  );
  assert.match(article.html, /<math\b/); // Accessible MathML accompanies the visual formula.
});

test('footnotes cannot modify link attributes or nest anchors inside other links', () => {
  const article = compileArticle(
    '[link](https://example.com "note[^a]") [A[^a]](https://example.com)\n\n<a href="https://example.com" title="[^a]">[^a]</a>\n\n[^a]: Unused note.',
    'attributes.md',
  );
  assert.match(article.html, /title="note\[\^a\]"/);
  assert.match(article.html, /title="\[\^a\]"/);
  assert.doesNotMatch(article.html, /<sup|article-footnotes/);
});

test('indented and tilde fences, multi-backtick spans and HTML code preserve literal syntax', () => {
  const article = compileArticle(
    '   ```text\n[^a]: stays code\n$x$\n   ```\n\n~~~text\n[^a]\n~~~\n\n``[^a] ` $x$`` and <code>[^a] $x$</code>\n\nReference[^a].',
    'code.md',
  );
  assert.match(article.html, /<code class="hljs">\[\^a\]: stays code\n\$x\$/);
  assert.match(article.html, /<code>\[\^a\] \$x\$<\/code>/);
  assert.match(article.html, /<p>Reference\[\^a\].<\/p>/);
  assert.doesNotMatch(article.html, /footnote-ref|class="katex"/);
});

test('colliding footnote labels receive unique anchors and each occurrence has a backlink', () => {
  const article = compileArticle(
    'One[^a.b]. Two[^a-b]. Again[^a.b].\n\n[^a.b]: First.\n[^a-b]: Second.',
    'notes.md',
  );
  const ids = [...article.html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const match of article.html.matchAll(/href="#([^"]+)"/g))
    assert.ok(ids.includes(match[1]), `Missing target ${match[1]}`);
  assert.equal((article.html.match(/class="footnote-back"/g) || []).length, 3);
  assert.equal(article.description, 'One. Two. Again.');
});

test('footnotes support multiple paragraphs, nested code and formulas without shared state', () => {
  const article = compileArticle(
    'One[^a].\n\n[^a]: First $x^2$.\n\n    Second with **bold**.\n\n    ```text\n    [^not]: literal\n    ```\n\nEnd.',
    'notes.md',
  );
  assert.match(article.html, /class="katex"/);
  assert.match(article.html, /Second with <strong>bold<\/strong>/);
  assert.match(article.html, /\[\^not\]: literal/);
  assert.match(article.html, /<p>End.<\/p>/);
  assert.doesNotMatch(compileArticle('Undefined[^a].', 'next.md').html, /footnote-ref/);
});

test('literal placeholder-like prose and code are not rewritten', () => {
  const article = compileArticle(
    'Literal ALICIA_MATH_PLACEHOLDER_0 and ALICIA_FNREF_0_1. Math $a < b$.\n\n`<span data-math-index="0">x</span>`',
    'literal.md',
  );
  assert.match(article.html, /Literal ALICIA_MATH_PLACEHOLDER_0 and ALICIA_FNREF_0_1/);
  assert.match(article.html, /&lt;span data-math-index=/);
  assert.match(article.html, /class="katex"/);
});

test('unsafe math remains untrusted and normal currency stays literal', () => {
  const article = compileArticle(
    'Price $5 and $10.\n\n$\\href{javascript:alert(1)}{bad}$',
    'safe-math.md',
  );
  assert.match(article.html, /Price \$5 and \$10/);
  assert.doesNotMatch(article.html, /href="javascript:|<script|onerror=/);
});

test('metadata trims tags, handles BOM/CRLF and rejects quoted draft booleans', () => {
  const article = compileArticle(
    '\uFEFF---\r\ntags: [" 学习 ", 学习, ""]\r\n---\r\n# Title\r\n\r\nBody.',
    'note.md',
  );
  assert.deepEqual(article.tags, ['学习']);
  assert.equal(article.title, 'Title');
  assert.equal(compileArticle('---\n---\n# Empty metadata', 'empty.md').title, 'Empty metadata');
  assert.throws(() => compileArticle('---\ndraft: "true"\n---\nDraft', 'draft.md'), /布尔值/);
});

test('malformed and encoded traversal links are rejected and query links stay intact', () => {
  assert.throws(() => compileArticle('![x](%2e%2e%5csecret.png)', 'note.md'), /不可越过/);
  assert.throws(() => compileArticle('[x](%invalid)', 'note.md'), /无效的链接/);
  const article = compileArticle(
    '[search](?q=hello)\n\n[mail](mailto:a@example.com)\n\n[external](https://example.com)',
    'note.md',
  );
  assert.match(article.html, /href="\?q=hello"/);
  assert.match(article.html, /href="mailto:a@example.com"/);
  assert.match(article.html, /target="_blank" rel="noopener noreferrer"/);
});

test('metadata accepts zoned timestamps and rejects malformed or impossible dates', () => {
  const article = compileArticle(
    '---\ndate: 2026-09-19T09:00:00+08:00\nupdated: 2026-09-19T10:30:00+08:00\n---\nText',
    'note.md',
  );
  assert.equal(article.date, '2026-09-19T09:00:00+08:00');
  assert.equal(article.updated, '2026-09-19T10:30:00+08:00');
  for (const field of ['date', 'updated']) {
    for (const value of [
      '2026-02-30',
      '2026-02-30T09:00:00Z',
      '2026-09-19T24:00:00Z',
      'yesterday',
      '2026-09-19T09:00:00',
    ]) {
      assert.throws(
        () => compileArticle(`---\n${field}: ${value}\n---\nText`, 'invalid.md'),
        new RegExp(`${field} 请使用有效的`),
      );
    }
  }
  assert.throws(
    () => compileArticle('---\nupdated: 42\n---\nText', 'invalid.md'),
    /updated 必须是字符串/,
  );
});
