import sanitizeHtml from 'sanitize-html';
import { decodeHTML } from 'entities';

export const escapeHtml = (text) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export const slugFromFile = (filename) => filename.replace(/\.(md|html)$/i, '');
export const headingSlug = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '') || 'heading';

export function plainText(html) {
  const withoutFootnotes = sanitizeHtml(html, {
    allowedTags: ['sup'],
    allowedAttributes: { sup: ['class'] },
    exclusiveFilter: (frame) => frame.tag === 'sup' && frame.attribs.class === 'footnote-ref',
  });
  return decodeHTML(sanitizeHtml(withoutFootnotes, { allowedTags: [], allowedAttributes: {} }))
    .replace(/\s+/g, ' ')
    .trim();
}

const readingBlockTags = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'div',
  'li',
  'dt',
  'dd',
  'td',
  'th',
  'tr',
  'pre',
  'blockquote',
  'section',
  'article',
  'aside',
  'figure',
  'figcaption',
  'summary',
  'details',
  'ul',
  'ol',
  'dl',
  'br',
  'hr',
]);

/** Input is normalized, sanitized HTML, before math rendering and code controls. */
export function estimateReadingMinutes(html) {
  // Strip known markup directly instead of sanitizing the whole document twice again.
  const text = decodeHTML(
    html
      .replace(/<(sup|a)\b[^>]*class="footnote-(?:ref|back)"[^>]*>[\s\S]*?<\/\1>/g, '')
      .replace(/(<section class="article-footnotes"[^>]*>)<p>Footnotes<\/p>/g, '$1')
      .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (_tag, name) =>
        readingBlockTags.has(name.toLowerCase()) ? ' ' : '',
      ),
  );
  const chineseCharacters = (text.match(/\p{Script=Han}/gu) || []).length;
  const words = (text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
  return Math.max(1, Math.ceil(chineseCharacters / 350 + words / 220));
}
