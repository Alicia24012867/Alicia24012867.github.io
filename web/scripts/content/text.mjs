import sanitizeHtml from 'sanitize-html';
import { decodeHTML } from 'entities';
import { textLanguage } from '../../src/content/language.mjs';

export const escapeHtml = (text) =>
  String(text)
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

/**
 * Returns `${base}-2`, `-3`, … skipping taken anchors. Each base resumes where it
 * last stopped, so k repeats cost O(k) instead of rescanning from 2 every time.
 * Callers must take each returned anchor, and `isTaken` may only ever grow.
 * @param {(anchor: string) => boolean} isTaken
 */
export function createSuffixer(isTaken) {
  const next = new Map();
  return (base) => {
    let suffix = next.get(base) ?? 2;
    while (isTaken(`${base}-${suffix}`)) suffix++;
    next.set(base, suffix + 1);
    return `${base}-${suffix}`;
  };
}

export function plainText(html) {
  const text = sanitizeHtml(html, {
    allowedTags: ['sup'],
    allowedAttributes: { sup: ['class'] },
    // Remove reference contents, but unwrap ordinary superscripts in the same pass.
    exclusiveFilter: (frame) =>
      frame.tag === 'sup' && (frame.attribs.class === 'footnote-ref' || 'excludeTag'),
  });
  return decodeHTML(text).replace(/\s+/g, ' ').trim();
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
function readableText(html) {
  // Strip known markup directly instead of sanitizing the whole document twice again.
  return decodeHTML(
    html
      .replace(/<(sup|a)\b[^>]*class="footnote-(?:ref|back)"[^>]*>[\s\S]*?<\/\1>/g, '')
      .replace(/(<section class="article-footnotes"[^>]*>)<p>Footnotes<\/p>/g, '$1')
      .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (_tag, name) =>
        readingBlockTags.has(name.toLowerCase()) ? ' ' : '',
      ),
  );
}

const HAN_PER_MINUTE = 350;
const WORDS_PER_MINUTE = 220;

/**
 * Reading units count one per Chinese character and one per word, so mixed
 * Chinese and English articles report a single number. The estimate keeps both
 * reading speeds, adds them together and rounds up to at least one minute.
 */
export function measureArticle(html) {
  const text = readableText(html);
  const chineseCharacters = (text.match(/\p{Script=Han}/gu) || []).length;
  const words = (text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
  return {
    wordCount: chineseCharacters + words,
    readingMinutes: Math.max(
      1,
      Math.ceil(chineseCharacters / HAN_PER_MINUTE + words / WORDS_PER_MINUTE),
    ),
  };
}

/** The language of the prose, leaving out code and formulas; input as for `measureArticle`. */
export function proseLanguage(html) {
  return textLanguage(
    readableText(
      html
        .replace(/<pre\b[\s\S]*?<\/pre>/gi, ' ')
        .replace(/<code\b[\s\S]*?<\/code>/gi, ' ')
        .replace(/<(span|div) data-math-index="\d+">[^<]*<\/\1>/g, ' '),
    ),
  );
}
