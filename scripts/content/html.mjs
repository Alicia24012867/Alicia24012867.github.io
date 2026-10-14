import sanitizeHtml from 'sanitize-html';
import { decodeHTML } from 'entities';
import hljs from 'highlight.js/lib/common';
import { articleFigures } from '../../src/config/figures.mjs';
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
 * cannot read the attributes, so the ratio also goes in a custom property.
 */
export function sizeImages(html, sizeOf) {
  return html.replace(/<img\b([^>]*?)(\s*\/?)>/g, (tag, attributes, end) => {
    // A width or height the author wrote stays exactly as written.
    if (/\s(?:width|height)="/.test(attributes)) return tag;
    const src = /\ssrc="([^"]*)"/.exec(attributes)?.[1];
    const size = src && sizeOf(decodeHTML(src));
    if (!size) return tag;
    const { width, height } = size;
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
