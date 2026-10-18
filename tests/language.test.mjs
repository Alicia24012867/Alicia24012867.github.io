import test from 'node:test';
import assert from 'node:assert/strict';
import { compileArticle } from '../scripts/content/compile.mjs';
import { textLanguage } from '../src/content/language.mjs';

test('text is Chinese when Chinese characters outnumber the other words', () => {
  assert.equal(textLanguage('写在20岁前'), 'zh-CN');
  assert.equal(textLanguage('Part 2: LTE estimation 的具体实现'), 'zh-CN');
  assert.equal(textLanguage('Moments in life'), 'en');
  assert.equal(textLanguage('Transient Analysis - timestep control'), 'en');
  // A Chinese word inside English text stays English.
  assert.equal(textLanguage('A walk through 北京 in autumn'), 'en');
  assert.equal(textLanguage(''), 'en');
});

test('an article takes the language of its prose, not of its code or formulas', () => {
  const chinese = compileArticle('这是一篇中文文章，讲一讲步长控制。\n', 'zh.md');
  assert.equal(chinese.lang, 'zh-CN');
  const english = compileArticle('An English post about the sky.\n', 'en.md');
  assert.equal(english.lang, 'en');
  // English code and formulas do not outweigh Chinese prose, and vice versa.
  const code = '```c\nint main(void) { return compute_the_next_time_step(delta, order); }\n```';
  assert.equal(compileArticle(`中文说明很短。\n\n${code}\n`, 'mixed.md').lang, 'zh-CN');
  assert.equal(
    compileArticle('Short note.\n\n```text\n这里是一大段中文日志输出内容\n```\n', 'log.md').lang,
    'en',
  );
  assert.equal(
    compileArticle('中文描述公式。\n\n$$\\frac{a+b}{c+d}=e^{x}+y+z$$\n', 'math.md').lang,
    'zh-CN',
  );
});

test('front matter can set the language, which must be a language code', () => {
  assert.equal(compileArticle('---\nlang: en\n---\n中文正文。\n', 'set.md').lang, 'en');
  assert.equal(compileArticle('---\nlang: zh-TW\n---\nEnglish body.\n', 'tw.md').lang, 'zh-TW');
  assert.throws(() => compileArticle('---\nlang: Chinese\n---\nText.\n', 'bad.md'), /lang/);
  assert.throws(() => compileArticle('---\nlang: 1\n---\nText.\n', 'number.md'), /lang/);
});

test('code inside a Chinese article keeps the English typesetting it had', () => {
  const article = compileArticle(
    '这是中文正文。\n\n```c\n/* 中文注释 */\nint x = 1;\n```\n\n```mermaid\ngraph TD; A-->B\n```\n',
    'code.md',
  );
  assert.equal(article.lang, 'zh-CN');
  const blocks = article.html.match(/<pre\b[^>]*>/g);
  assert.equal(blocks.length, 2);
  for (const block of blocks) assert.match(block, /\slang="en"/);
  // English articles leave their code alone.
  const english = compileArticle('English.\n\n```c\nint x;\n```\n', 'english.md');
  assert.doesNotMatch(english.html, /<pre[^>]*\slang=/);
});

test('curly quotes take the width of the words beside them, not of the article', () => {
  const english = compileArticle(
    'She wrote “你好” and **“远大志向”**. It’s `“中”` code.\n',
    'en-quotes.md',
  );
  assert.equal(english.lang, 'en');
  assert.match(
    english.html,
    /wrote <span class="quote-cjk">“<\/span>你好<span class="quote-cjk">”<\/span> and <strong><span class="quote-cjk">“<\/span>远大志向<span class="quote-cjk">”<\/span><\/strong>\. It’s <code>“中”<\/code>/,
  );
  const chinese = compileArticle('他说“好的”，然后用英文写了 I’m fine。\n', 'zh-quotes.md');
  assert.equal(chinese.lang, 'zh-CN');
  assert.match(
    chinese.html,
    /他说“好的”，然后用英文写了 I<span class="quote-latin">’<\/span>m fine。/,
  );
  // Search and headings read the text as written.
  assert.doesNotMatch(english.searchText, /quote-cjk/);
});
