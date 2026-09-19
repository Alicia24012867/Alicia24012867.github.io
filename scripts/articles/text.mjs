import sanitizeHtml from 'sanitize-html';
import { decodeHTML } from 'entities';

export const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const slugFromFile = (filename) => filename.replace(/\.(md|html)$/i, '');
export const headingSlug = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'heading';

export function plainText(html) {
  const withoutFootnotes = sanitizeHtml(html, {
    allowedTags: ['sup'],
    allowedAttributes: { sup: ['class'] },
    exclusiveFilter: (frame) => frame.tag === 'sup' && frame.attribs.class === 'footnote-ref',
  });
  return decodeHTML(sanitizeHtml(withoutFootnotes, { allowedTags: [], allowedAttributes: {} })).replace(/\s+/g, ' ').trim();
}
