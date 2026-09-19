import { Marked } from 'marked';
import katex from 'katex';
import { escapeHtml, headingSlug } from './text.mjs';

/** Extensions run on Markdown tokens, never inside code or HTML attributes. */
export function renderMarkdown(body) {
  const definitions = new Map();
  const references = new Map();
  const anchors = new Set();
  const mathHtml = [];
  const rememberMath = (tex, display) => {
    const trimmed = tex.trim();
    const rendered = !trimmed || trimmed.length > 4000
      ? `<code>${escapeHtml(trimmed || tex)}</code>`
      : katex.renderToString(trimmed, { displayMode: display, throwOnError: false, output: 'htmlAndMathml', strict: 'ignore', trust: false });
    const index = mathHtml.length;
    mathHtml.push(display ? `<div class="article-math">${rendered}</div>` : rendered);
    const tag = display ? 'div' : 'span';
    // Keep readable TeX available to title, summary and heading extraction.
    return `<${tag} data-math-index="${index}">${escapeHtml(trimmed)}</${tag}>`;
  };

  const parser = new Marked({ gfm: true, async: false, extensions: [
    {
      name: 'footnoteDefinition', level: 'block',
      start: (source) => source.search(/^ {0,3}\[\^[^\]\n]+\]:/m),
      tokenizer(source) {
        const first = /^ {0,3}\[\^([^\]\n]+)\]:[ \t]*([^\n]*)(?:\n|$)/.exec(source);
        if (!first) return;
        let raw = first[0];
        const lines = [first[2]];
        let rest = source.slice(raw.length);
        while (rest) {
          const continuation = /^(?: {4}|\t)([^\n]*)(?:\n|$)/.exec(rest);
          if (continuation) {
            raw += continuation[0];
            lines.push(continuation[1]);
            rest = rest.slice(continuation[0].length);
          } else {
            const blank = /^(?:[ \t]*\n)+(?= {4}|\t)/.exec(rest);
            if (!blank) break;
            raw += blank[0];
            lines.push('');
            rest = rest.slice(blank[0].length);
          }
        }
        if (!definitions.has(first[1])) definitions.set(first[1], lines.join('\n'));
        return { type: 'footnoteDefinition', raw };
      },
      renderer: () => '',
    },
    {
      name: 'footnoteReference', level: 'inline',
      start: (source) => source.indexOf('[^'),
      tokenizer(source) {
        if (this.lexer.state.inRawBlock || this.lexer.state.inLink) return;
        const match = /^\[\^([^\]\n]+)\]/.exec(source);
        if (match) return { type: 'footnoteReference', raw: match[0], label: match[1] };
      },
      renderer(token) {
        if (!definitions.has(token.label)) return escapeHtml(token.raw);
        let reference = references.get(token.label);
        if (!reference) {
          const base = headingSlug(token.label);
          let anchor = base;
          let suffix = 2;
          while (anchors.has(anchor)) anchor = `${base}-${suffix++}`;
          anchors.add(anchor);
          reference = { label: token.label, anchor, number: references.size + 1, count: 0 };
          references.set(token.label, reference);
        }
        reference.count += 1;
        return `<sup class="footnote-ref" id="fnref-${reference.anchor}-${reference.count}"><a href="#fn-${reference.anchor}" aria-describedby="fn-${reference.anchor}">${reference.number}</a></sup>`;
      },
    },
    {
      name: 'blockMath', level: 'block',
      start: (source) => source.indexOf('$$'),
      tokenizer(source) {
        const match = /^\$\$([\s\S]+?)\$\$(?:[ \t]*\n|$)/.exec(source);
        if (match) return { type: 'blockMath', raw: match[0], text: match[1] };
      },
      renderer: (token) => rememberMath(token.text, true),
    },
    {
      name: 'inlineMath', level: 'inline',
      start: (source) => source.indexOf('$'),
      tokenizer(source) {
        if (this.lexer.state.inRawBlock) return;
        const match = /^\$(?!\s|\$)((?:\\[^\n]|[^$\n])+?)(?<!\s)\$(?!\d)/.exec(source);
        if (match) return { type: 'inlineMath', raw: match[0], text: match[1] };
      },
      renderer: (token) => rememberMath(token.text, false),
    },
  ] });

  const html = parser.parse(body);
  const notes = [];
  // Parsing a note can discover another note; each definition is rendered only once.
  for (const reference of references.values()) {
    notes.push({ reference, content: parser.parse(definitions.get(reference.label)) });
  }
  const items = notes.map(({ reference, content }) => {
    const backlinks = Array.from({ length: reference.count }, (_, index) => `<a class="footnote-back" href="#fnref-${reference.anchor}-${index + 1}" aria-label="返回第 ${reference.number} 条脚注的第 ${index + 1} 处引用">↩${reference.count > 1 ? index + 1 : ''}</a>`).join(' ');
    return `<li id="fn-${reference.anchor}"><div class="footnote-content">${content}<p>${backlinks}</p></div></li>`;
  });
  const footnotes = items.length ? `<section class="article-footnotes" aria-label="脚注"><p>脚注</p><ol>${items.join('')}</ol></section>` : '';
  return { html, footnotes, mathHtml };
}

export function restoreMath(html, mathHtml) {
  // Replace complete generated nodes only, never text in attributes or code.
  return html.replace(/<(span|div) data-math-index="(\d+)">[^<]*<\/\1>/g, (match, _tag, index) => mathHtml[Number(index)] || match);
}
