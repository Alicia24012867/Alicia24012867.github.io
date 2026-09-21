import path from 'node:path';
import { parseArticleSource } from './metadata.mjs';
import { renderMarkdown, restoreMath } from './markdown.mjs';
import { createReferenceResolver } from './references.mjs';
import { sanitizeArticleHtml, extractHeadings, decorateRichHtml } from './html.mjs';
import { estimateReadingMinutes, plainText, slugFromFile } from './text.mjs';

/** Build-time pipeline; no Markdown parser or sanitizer is shipped to the homepage. */
export function compileArticle(
  source,
  filename,
  resolveAsset = (file) => `../articles/${file}`,
  onArticleLink,
) {
  const parsed = parseArticleSource(source, filename);
  if (!parsed) return null;
  const { body, metadata } = parsed;
  const format = filename.toLowerCase().endsWith('.md') ? 'Markdown' : 'HTML';
  const rendered =
    format === 'Markdown' ? renderMarkdown(body) : { html: body, footnotes: '', mathHtml: [] };
  const resolveReference = createReferenceResolver(filename, resolveAsset, onArticleLink);
  let html = sanitizeArticleHtml(rendered.html, resolveReference);
  const firstTitle = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title =
    metadata.title ||
    (firstTitle ? plainText(firstTitle[1]) : path.posix.basename(slugFromFile(filename)));
  if (firstTitle && plainText(firstTitle[1]) === title) html = html.replace(firstTitle[0], '');

  const footnotes = sanitizeArticleHtml(rendered.footnotes, resolveReference);
  const extracted = extractHeadings(html, footnotes);
  html = extracted.html;
  const paragraph = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '';
  const description = metadata.description || plainText(paragraph).slice(0, 140);
  // Count the complete body before code controls and duplicated math markup are added.
  html += footnotes;
  const readingMinutes = estimateReadingMinutes(html);
  html = restoreMath(decorateRichHtml(html), rendered.mathHtml);

  return {
    ...metadata,
    slug: slugFromFile(filename),
    title,
    description,
    format,
    readingMinutes,
    html,
    hasMath: rendered.mathHtml.length > 0,
    headings: extracted.headings,
    searchText: plainText(restoreMath(extracted.html + footnotes, rendered.mathHtml)).toLowerCase(),
  };
}
