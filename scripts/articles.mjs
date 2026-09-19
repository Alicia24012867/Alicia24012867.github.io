import path from 'node:path';
import { parseArticleSource } from './articles/metadata.mjs';
import { renderMarkdown, restoreMath } from './articles/markdown.mjs';
import { createReferenceResolver } from './articles/references.mjs';
import { sanitizeArticleHtml, extractHeadings, decorateRichHtml } from './articles/html.mjs';
import { plainText, slugFromFile } from './articles/text.mjs';

/** Build-time pipeline; no Markdown parser or sanitizer is shipped to the homepage. */
export function compileArticle(source, filename, resolveAsset = (file) => `../articles/${file}`, onArticleLink) {
  const parsed = parseArticleSource(source, filename);
  if (!parsed) return null;
  const { body, metadata } = parsed;
  const format = filename.toLowerCase().endsWith('.md') ? 'Markdown' : 'HTML';
  const rendered = format === 'Markdown' ? renderMarkdown(body) : { html: body, footnotes: '', mathHtml: [] };
  const resolveReference = createReferenceResolver(filename, resolveAsset, onArticleLink);
  let html = sanitizeArticleHtml(rendered.html, resolveReference);
  const firstTitle = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = metadata.title || (firstTitle ? plainText(firstTitle[1]) : path.posix.basename(slugFromFile(filename)));
  if (firstTitle && plainText(firstTitle[1]) === title) html = html.replace(firstTitle[0], '');

  const footnotes = sanitizeArticleHtml(rendered.footnotes, resolveReference);
  const extracted = extractHeadings(html, footnotes);
  html = extracted.html;
  const text = plainText(html);
  const paragraph = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '';
  const description = metadata.description || plainText(paragraph).slice(0, 140);
  const chineseCharacters = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u3400-\u9fff]/g, '').match(/[\p{L}\p{N}]+/gu) || []).length;
  html += footnotes;
  html = restoreMath(decorateRichHtml(html), rendered.mathHtml);

  return {
    ...metadata, slug: slugFromFile(filename), title, description, format,
    readingMinutes: Math.max(1, Math.ceil(chineseCharacters / 350 + words / 220)),
    html, headings: extracted.headings,
  };
}
