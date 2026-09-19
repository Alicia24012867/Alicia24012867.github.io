import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileArticle } from './articles.mjs';

test('test.md renders real Markdown, a unique title, code, tables, tasks and local images', () => {
  const source = readFileSync(new URL('../articles/test.md', import.meta.url), 'utf8');
  const article = compileArticle(source, 'test.md', asset => `/built/${asset}`);
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
  const article = compileArticle('---\ntitle: HTML 示例\ndate: 2026-09-18\ntags: [HTML]\n---\n<!doctype html><html><head><title>不该显示</title><style>body{display:none}</style></head><body><h1>HTML 示例</h1><h2 id="intro">章节</h2><p style="color:red" onclick="alert(1)">正文</p><script>alert(1)</script><iframe src="https://example.com"></iframe><a href="javascript:alert(1)">链接</a></body></html>', 'example.html');
  assert.equal(article.title, 'HTML 示例');
  assert.equal(article.format, 'HTML');
  assert.deepEqual(article.headings, [{ id: 'intro', text: '章节', level: 2 }]);
  assert.match(article.html, /<p>正文<\/p>/);
  assert.doesNotMatch(article.html, /不该显示|display:none|onclick|style=|<script|<iframe|javascript:/);
});

test('nested article links and attachments resolve under the article directory', () => {
  const article = compileArticle('# Example\n\n[下一篇](../test.md#section-intro)\n\n![图](../assets/sky.webp)\n\n[PDF](./notes.pdf)\n\n![公共图](/images/summer-sky.webp)', '2026/note.md', asset => `../bundled/${asset}`);
  assert.match(article.html, /href="\?post=test#section-intro"/);
  assert.match(article.html, /src="\.\.\/bundled\/assets\/sky.webp"/);
  assert.match(article.html, /href="\.\.\/bundled\/2026\/notes.pdf"/);
  assert.match(article.html, /src="\.\.\/images\/summer-sky.webp"/);
});

test('headings have stable unique anchors and metadata falls back to normal article content', () => {
  const article = compileArticle('# Research & curiosity\n\nA small beginning.\n\n## 重复标题\n\nText\n\n## 重复标题', 'a-note.md');
  assert.equal(article.title, 'Research & curiosity');
  assert.equal(article.description, 'A small beginning.');
  assert.deepEqual(article.headings.map(heading => heading.id), ['section-重复标题', 'section-重复标题-2']);
});

test('markdown math is rendered after sanitizing, and dollar signs in code stay literal', () => {
  const article = compileArticle('# Math\n\nEnergy $E=mc^2$ stays inline.\n\n$$\\alpha + \\beta$$\n\n```js\nconst price = "$5"\n```\n', 'math.md');
  assert.match(article.html, /class="katex"/);
  assert.match(article.html, /class="article-math"/);
  assert.match(article.html, /\$5/);
  assert.doesNotMatch(article.html, /ALICIA_MATH_PLACEHOLDER|\$E=mc\^2\$/);
});

test('mermaid fences become diagrams with escaped source, not executable HTML', () => {
  const article = compileArticle('# Diagram\n\n```mermaid\nflowchart LR\n  A["<script>alert(1)</script>"] --> B\n```\n', 'diagram.md');
  assert.match(article.html, /class="article-mermaid"/);
  assert.match(article.html, /flowchart LR/);
  assert.match(article.html, /&lt;script&gt;/);
  assert.doesNotMatch(article.html, /<script|ALICIA_MATH_PLACEHOLDER/);
});

test('footnotes stay out of code, and article sections are a fixed list', () => {
  const footnoted = compileArticle('See this[^1] and `[^skip]`.\n\n```js\nconst mark = "[^skip]";\n```\n\n[^1]: Safe <script>alert(1)</script> note.\n[^skip]: unused\n', 'notes.md');
  assert.match(footnoted.html, /class="footnote-ref"/);
  assert.match(footnoted.html, /Safe/);
  assert.match(footnoted.html, /\[(?:\^|&caret;)?skip\]|\[\^skip\]/);
  assert.doesNotMatch(footnoted.html, /<script/);
  assert.equal(compileArticle('---\nsection: 生活\n---\n# Life\n\nHello.', 'sky.md').section, 'life');
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
