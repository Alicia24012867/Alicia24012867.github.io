import sanitizeHtml from 'sanitize-html';
import { decodeHTML } from 'entities';
import hljs from 'highlight.js/lib/common';
import { articleFigures } from '../../src/config/figures.mjs';
import { copySizes, imagePlaces } from './resize.mjs';
import { createSuffixer, escapeHtml, headingSlug, plainText } from './text.mjs';

export function sanitizeArticleHtml(html, resolveReference) {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'figure',
      'figcaption',
      'details',
      'summary',
      'input',
      'del',
      's',
      'sup',
    ],
    allowedAttributes: {
      '*': ['id'],
      a: ['href', 'title', 'target', 'rel', 'class', 'aria-describedby', 'aria-label'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      code: ['class'],
      th: ['align', 'colspan', 'rowspan'],
      td: ['align', 'colspan', 'rowspan'],
      input: ['type', 'checked', 'disabled', 'aria-label'],
      ol: ['start'],
      sup: ['class'],
      span: ['data-math-index'],
      div: ['data-math-index', 'class'],
      section: ['class', 'aria-label'],
      figure: ['data-figure'],
    },
    allowedClasses: {
      code: ['language-*'],
      sup: ['footnote-ref'],
      a: ['footnote-back'],
      div: ['footnote-content', 'article-gallery'],
      section: ['article-footnotes'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    nonTextTags: ['head', 'style', 'script', 'textarea', 'option'],
    transformTags: {
      a: (_tag, attrs) => {
        const href = resolveReference(attrs.href || '');
        const external = /^(?:https?:)?\/\//i.test(href);
        const attribs = { ...attrs, href };
        delete attribs.target;
        delete attribs.rel;
        if (external) Object.assign(attribs, { target: '_blank', rel: 'noopener noreferrer' });
        return { tagName: 'a', attribs };
      },
      img: (_tag, attrs) => ({
        tagName: 'img',
        attribs: {
          ...attrs,
          src: resolveReference(attrs.src || '', true),
          alt: attrs.alt || '',
          loading: 'lazy',
          decoding: 'async',
        },
      }),
      input: (_tag, attrs) => ({
        tagName: 'input',
        attribs: {
          type: 'checkbox',
          disabled: '',
          'aria-label': 'Article checklist item',
          ...('checked' in attrs ? { checked: '' } : {}),
        },
      }),
    },
  });
}

/**
 * Local images get their real size, so text below them stays put while they load. CSS
 * cannot read the attributes, so the ratio also goes in a custom property. A large photo
 * can show a smaller copy that copyOf names; the photo viewer still opens the full file.
 */
export function sizeImages(html, sizeOf, copyOf) {
  const places = copyOf ? imagePlaces(html) : [];
  let index = 0;
  return html.replace(/<img\b([^>]*?)(\s*\/?)>/g, (tag, attributes, end) => {
    const place = places[index++];
    // A width or height the author wrote stays exactly as written.
    if (/\s(?:width|height)="/.test(attributes)) return tag;
    const src = /\ssrc="([^"]*)"/.exec(attributes)?.[1];
    const size = src && sizeOf(decodeHTML(src));
    if (!size) return tag;
    const { width, height } = size;
    const copy = place && copyOf(decodeHTML(src), size, place);
    if (copy) {
      // Screens that need more pixels than the copy has pick the photo itself.
      const choices = `${copy.src} ${copy.width}w, ${src} ${width}w`;
      attributes = attributes.replace(
        /\ssrc="[^"]*"/,
        () => ` src="${copy.src}" srcset="${choices}" sizes="${copySizes(size, place)}"`,
      );
      // A linked photo opens the file its link names.
      if (!place.linked) attributes += ` data-full-src="${src}"`;
    }
    return `<img${attributes} width="${width}" height="${height}" style="--ratio: ${width} / ${height}"${end}>`;
  });
}

/** Interactive figure placeholders must name a known figure and stay empty for the reader. */
export function checkFigures(html, filename) {
  const placeholders = html.matchAll(
    /<figure\b[^>]*\sdata-figure="([^"]*)"[^>]*>([\s\S]*?)<\/figure>/g,
  );
  for (const [, encodedName, inner] of placeholders) {
    const name = decodeHTML(encodedName);
    if (!articleFigures.includes(name)) {
      throw new Error(`${filename}: 未知的交互图 ${name}，可用：${articleFigures.join('、')}`);
    }
    if (inner.trim()) throw new Error(`${filename}: 交互图 ${name} 的占位元素内请勿填写内容`);
  }
}

export function extractHeadings(html, footnotes = '') {
  const headings = [];
  // Reserve authored anchors before generating any: a later custom id must not be stolen.
  const authoredIds = new Set();
  const ids = new Set(['main']);
  for (const [, tag, attrs] of `${html}${footnotes}`.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    const encodedId = attrs.match(/\bid="([^"]+)"/)?.[1];
    if (!encodedId) continue;
    const id = decodeHTML(encodedId);
    authoredIds.add(id);
    if (!/^h[1-6]$/i.test(tag)) ids.add(id);
  }
  const suffixed = createSuffixer((id) => ids.has(id) || authoredIds.has(id));
  html = html.replace(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (_match, depth, attrs, inner) => {
    const level = Math.max(2, Number(depth));
    const text = plainText(inner);
    const authoredId = decodeHTML(attrs.match(/\bid="([^"]+)"/)?.[1] || '');
    const base = authoredId || `section-${headingSlug(text)}`;
    // A heading may keep its own authored id; a suffixed form can never equal it.
    const id =
      ids.has(base) || (base !== authoredId && authoredIds.has(base)) ? suffixed(base) : base;
    ids.add(id);
    if (level <= 3 && text) headings.push({ id, text, level });
    return `<h${level} id="${escapeHtml(id)}">${inner}</h${level}>`;
  });
  return { html, headings };
}

export function decorateRichHtml(html) {
  html = html.replace(
    /<pre><code(?: class="language-([^"\s]+)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_match, language, contents) => {
      const code = decodeHTML(contents);
      const copy = '<button type="button" class="copy-code" aria-label="Copy code">Copy</button>';
      if (/^mermaid$/i.test(language || '') && code.trim() && code.length <= 8000) {
        return `<figure class="article-mermaid">${copy}<pre class="mermaid-source">${escapeHtml(code)}</pre><div class="mermaid-canvas" hidden></div></figure>`;
      }
      const highlighted =
        language && hljs.getLanguage(language)
          ? hljs.highlight(code, { language, ignoreIllegals: true }).value
          : escapeHtml(code);
      return `<pre data-language="${escapeHtml(language || 'text')}" tabindex="0" aria-label="${escapeHtml(language || 'text')} code">${copy}<code class="hljs">${highlighted}</code></pre>`;
    },
  );
  return html
    .replace(
      /<table\b/g,
      '<div class="article-table" role="region" aria-label="Article table, scroll horizontally" tabindex="0"><table',
    )
    .replaceAll('</table>', '</table></div>');
}

const curlyQuote = /[‘’“”]/g;
const eastAsian = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-〿＀-￯]/u;
// Neither code nor formulas are prose; a block starts its text afresh.
const unmarked = /^<(code|pre|kbd|samp)\b|^<(span|div)\b[^>]*\sdata-math-index=/i;
const block =
  /^<\/?(?:p|li|ul|ol|h[1-6]|blockquote|div|section|figure|figcaption|table|tr|td|th|details|summary|br|hr|img)\b/i;

/**
 * The curly quotes ‘ ’ “ ” are full width in Chinese text and narrow in other text. Pages
 * pick the width from the language of the block (global.css), so a quote whose neighbours
 * are in the other language is marked: a Chinese phrase in English text keeps full-width
 * quotes, and an English word in Chinese text takes narrow ones.
 */
export function markQuotes(html, lang) {
  const chinese = /^zh\b/i.test(lang);
  const parts = html.split(/(<[^>]*>)/);
  // Each run of prose: the parts it is made of, in order.
  const runs = [[]];
  const skipping = [];
  parts.forEach((part, index) => {
    if (index % 2 === 0) {
      if (!skipping.length && part) runs.at(-1).push(index);
      return;
    }
    const name = /^<\/?([a-z][a-z0-9]*)/i.exec(part)?.[1].toLowerCase();
    if (skipping.length) {
      if (part.startsWith('</') && name === skipping.at(-1)) skipping.pop();
      else if (!part.startsWith('</') && !part.endsWith('/>') && name === skipping.at(-1))
        skipping.push(name);
      return;
    }
    if (unmarked.test(part)) {
      skipping.push(name);
      runs.push([]);
    } else if (block.test(part)) runs.push([]);
  });
  for (const run of runs) {
    const text = run.map((index) => parts[index]).join('');
    // The nearest character beside a quote that is not a quote itself.
    const beside = (at, step) => {
      for (let i = at + step; i >= 0 && i < text.length; i += step)
        if (!/[‘’“”]/.test(text[i])) return text[i];
      return '';
    };
    const marks = new Map();
    for (const { index } of text.matchAll(curlyQuote)) {
      const before = beside(index, -1);
      const after = beside(index, 1);
      const near = eastAsian.test(before) || eastAsian.test(after);
      if (near && !chinese) marks.set(index, 'quote-cjk');
      // A quote with only spaces beside it keeps the block's width.
      else if (!near && chinese && /\S/.test(before + after)) marks.set(index, 'quote-latin');
    }
    if (!marks.size) continue;
    let offset = 0;
    for (const index of run) {
      const start = offset;
      offset += parts[index].length;
      parts[index] = parts[index].replace(curlyQuote, (quote, at) => {
        const mark = marks.get(start + at);
        return mark ? `<span class="${mark}">${quote}</span>` : quote;
      });
    }
  }
  return parts.join('');
}
