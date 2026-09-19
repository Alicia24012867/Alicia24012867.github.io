import path from 'node:path';
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { parse } from 'yaml';
import { decodeHTML } from 'entities';
import hljs from 'highlight.js/lib/common';
import katex from 'katex';
import { resolveArticleSection } from './sections.mjs';

const plainText = (html) => decodeHTML(sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })).replace(/\s+/g, ' ').trim();
const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const slugFromFile = (filename) => filename.replace(/\.(md|html)$/i, '');
const mathPlaceholder = (index) => `ALICIA_MATH_PLACEHOLDER_${index}`;

function renderMarkdown(body) {
  const mathHtml = [];
  const remember = (tex, display) => {
    const trimmed = tex.trim();
    const rendered = !trimmed || trimmed.length > 4000
      ? `<code>${escapeHtml(trimmed || tex)}</code>`
      : katex.renderToString(trimmed, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore' });
    const index = mathHtml.length;
    mathHtml.push(display ? `<div class="article-math">${rendered}</div>` : rendered);
    return mathPlaceholder(index);
  };
  const parser = new Marked();
  parser.use({
    gfm: true,
    extensions: [
      {
        name: 'blockMath',
        level: 'block',
        start: (src) => { const index = src.indexOf('$$'); return index === -1 ? undefined : index; },
        tokenizer(src) {
          const match = /^\$\$([\s\S]+?)\$\$/.exec(src);
          if (!match) return;
          return { type: 'blockMath', raw: match[0], text: match[1] };
        },
        renderer: (token) => remember(token.text, true),
      },
      {
        name: 'inlineMath',
        level: 'inline',
        start: (src) => { const index = src.indexOf('$'); return index === -1 ? undefined : index; },
        tokenizer(src) {
          const match = /^\$([^$\n]+?)\$/.exec(src);
          if (!match) return;
          return { type: 'inlineMath', raw: match[0], text: match[1] };
        },
        renderer: (token) => remember(token.text, false),
      },
    ],
  });
  return { html: parser.parse(body, { async: false }), mathHtml };
}

function isFenceOpen(line) {
  const match = /^(```+|~~~+)/.exec(line);
  return match ? match[1] : null;
}

function extractFootnoteDefinitions(source) {
  const definitions = new Map();
  let fence = null;
  const lines = source.split('\n');
  const kept = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence) {
      kept.push(line);
      if (line.startsWith(fence)) fence = null;
      continue;
    }
    const opener = isFenceOpen(line);
    if (opener) {
      fence = opener;
      kept.push(line);
      continue;
    }
    const definition = /^\[\^([^\]\n]+)\]:[ \t]*(.*)$/.exec(line);
    if (!definition) {
      kept.push(line);
      continue;
    }
    const parts = [definition[2]];
    while (index + 1 < lines.length && /^[ \t]+\S/.test(lines[index + 1])) {
      index += 1;
      parts.push(lines[index].trim());
    }
    definitions.set(definition[1], parts.join('\n').trim());
  }
  return { body: kept.join('\n'), definitions };
}

function replaceFootnoteReferences(source, definitions) {
  const order = [];
  const counts = new Map();
  let fence = null;
  const lines = source.split('\n').map((line) => {
    if (fence) {
      if (line.startsWith(fence)) fence = null;
      return line;
    }
    const opener = isFenceOpen(line);
    if (opener) {
      fence = opener;
      return line;
    }
    return line.split(/(`[^`]*`)/).map((part) => {
      if (part.startsWith('`')) return part;
      return part.replace(/\[\^([^\]\n]+)\]/g, (match, id) => {
        if (!definitions.has(id) || !definitions.get(id)) return match;
        if (!order.includes(id)) order.push(id);
        const occurrence = (counts.get(id) || 0) + 1;
        counts.set(id, occurrence);
        return `ALICIA_FNREF_${order.indexOf(id)}_${occurrence}`;
      });
    }).join('');
  });
  return { body: lines.join('\n'), order };
}

function footnoteAnchor(id) {
  return id.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'note';
}

function restoreMath(html, mathHtml) {
  if (!mathHtml.length) return html;
  return html
    .replace(/<p>\s*(ALICIA_MATH_PLACEHOLDER_\d+)\s*<\/p>/g, '$1')
    .replace(/ALICIA_MATH_PLACEHOLDER_(\d+)/g, (match, index) => mathHtml[Number(index)] || match);
}

function decorateRichHtml(html) {
  html = html.replace(/<pre><code(?: class="language-([^"\s]+)")?>([\s\S]*?)<\/code><\/pre>/g, (_match, language, contents) => {
    const code = decodeHTML(contents);
    if (/^mermaid$/i.test(language || '') && code.trim() && code.length <= 8000) {
      return `<figure class="article-mermaid"><button type="button" class="copy-code">复制</button><pre class="mermaid-source">${escapeHtml(code)}</pre><div class="mermaid-canvas" hidden></div></figure>`;
    }
    const highlighted = language && hljs.getLanguage(language) ? hljs.highlight(code, { language, ignoreIllegals: true }).value : escapeHtml(code);
    return `<pre data-language="${escapeHtml(language || 'text')}" tabindex="0" aria-label="${escapeHtml(language || 'text')} 代码"><button type="button" class="copy-code">复制</button><code class="hljs">${highlighted}</code></pre>`;
  });
  return html.replace(/<table\b/g, '<div class="article-table" role="region" aria-label="文章表格，可横向滚动" tabindex="0"><table').replaceAll('</table>', '</table></div>');
}

/** Compile author-controlled files at build time, never load a parser in the homepage. */
export function compileArticle(source, filename, resolveAsset = (file) => `../articles/${file}`) {
  let metadata = {};
  let body = source.replace(/^\uFEFF/, '');
  if (/^---\r?\n/.test(body)) {
    const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) throw new Error(`${filename}: front matter 缺少结束的 ---`);
    metadata = parse(match[1], { uniqueKeys: true }) ?? {};
    if (typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error(`${filename}: front matter 必须是对象`);
    body = body.slice(match[0].length);
  }
  if (metadata.draft === true) return null;
  for (const field of ['title', 'date', 'description']) {
    if (metadata[field] != null && typeof metadata[field] !== 'string') throw new Error(`${filename}: ${field} 必须是字符串`);
  }
  if (metadata.tags != null && (!Array.isArray(metadata.tags) || metadata.tags.some(tag => typeof tag !== 'string'))) {
    throw new Error(`${filename}: tags 应写成字符串列表，例如 [学习, 随记]`);
  }
  const date = metadata.date?.trim() || '';
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
    throw new Error(`${filename}: date 请使用有效的 YYYY-MM-DD 日期`);
  }
  const section = resolveArticleSection(metadata.section, filename);
  const format = filename.toLowerCase().endsWith('.md') ? 'Markdown' : 'HTML';
  const extracted = format === 'Markdown' ? extractFootnoteDefinitions(body) : { body, definitions: new Map() };
  const referenced = format === 'Markdown' ? replaceFootnoteReferences(extracted.body, extracted.definitions) : { body: extracted.body, order: [] };
  const markdown = format === 'Markdown' ? renderMarkdown(referenced.body) : { html: referenced.body, mathHtml: [] };
  const rendered = markdown.html;

  function resolveReference(value, image = false) {
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return value;
    // A leading slash means the site's root, including the GitHub Pages repository prefix.
    if (value.startsWith('/')) return `..${value}`;
    const match = value.match(/^([^?#]*)([?#].*)?$/);
    if (!match || !match[1]) return value;
    let decoded;
    try { decoded = decodeURIComponent(match[1]); } catch { throw new Error(`${filename}: 无效的链接 ${value}`); }
    const localFile = path.posix.normalize(path.posix.join(path.posix.dirname(filename), decoded));
    if (localFile.startsWith('../') || path.posix.isAbsolute(localFile)) throw new Error(`${filename}: 本地链接不可越过 articles 目录：${value}`);
    const suffix = match[2] || '';
    if (!image && /\.(md|html)$/i.test(localFile)) {
      const anchor = suffix.includes('#') ? suffix.slice(suffix.indexOf('#')) : '';
      return `?post=${encodeURIComponent(slugFromFile(localFile))}${anchor}`;
    }
    return resolveAsset(localFile) + suffix;
  }

  const htmlSanitize = {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'figure', 'figcaption', 'details', 'summary', 'input', 'del', 's', 'sup'],
    allowedAttributes: {
      '*': ['id'],
      a: ['href', 'title', 'target', 'rel', 'aria-describedby'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      code: ['class'],
      th: ['align', 'colspan', 'rowspan'],
      td: ['align', 'colspan', 'rowspan'],
      input: ['type', 'checked', 'disabled', 'aria-label'],
      ol: ['start'],
      sup: ['class'],
    },
    allowedClasses: { code: ['language-*'], sup: ['footnote-ref'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    nonTextTags: ['head', 'style', 'script', 'textarea', 'option'],
    transformTags: {
      a: (_tag, attrs) => {
        const href = resolveReference(attrs.href || '');
        const external = /^(?:https?:)?\/\//i.test(href);
        return { tagName: 'a', attribs: { ...attrs, href, ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : { target: '', rel: '' }) } };
      },
      img: (_tag, attrs) => ({ tagName: 'img', attribs: { ...attrs, src: resolveReference(attrs.src || '', true), alt: attrs.alt || '', loading: 'lazy', decoding: 'async' } }),
      input: (_tag, attrs) => ({ tagName: 'input', attribs: { type: 'checkbox', disabled: '', 'aria-label': '文章任务项', ...('checked' in attrs ? { checked: '' } : {}) } }),
    },
  };
  let html = sanitizeHtml(rendered, htmlSanitize);
  const firstTitle = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = metadata.title?.trim() || (firstTitle ? plainText(firstTitle[1]) : path.posix.basename(slugFromFile(filename)));
  if (firstTitle && plainText(firstTitle[1]) === title) html = html.replace(firstTitle[0], '');

  const headings = [];
  const ids = new Set();
  html = html.replace(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (_match, depth, attrs, inner) => {
    const level = Math.max(2, Number(depth));
    const text = plainText(inner);
    const authoredId = attrs.match(/\bid="([^"]+)"/)?.[1];
    const base = authoredId || `section-${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'heading'}`;
    let id = base;
    let count = 2;
    while (ids.has(id)) id = `${base}-${count++}`;
    ids.add(id);
    if (level <= 3) headings.push({ id: decodeHTML(id), text, level });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  const text = plainText(html);
  const paragraph = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '';
  const description = metadata.description?.trim() || plainText(paragraph).slice(0, 140);
  const chineseCharacters = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u3400-\u9fff]/g, '').match(/[\p{L}\p{N}]+/gu) || []).length;

  html = restoreMath(decorateRichHtml(html), markdown.mathHtml);

  if (referenced.order.length) {
    const items = referenced.order.map((id) => {
      const anchor = footnoteAnchor(id);
      const fragment = renderMarkdown(extracted.definitions.get(id) || '');
      const content = restoreMath(decorateRichHtml(sanitizeHtml(fragment.html, htmlSanitize)), fragment.mathHtml) || `<p>${escapeHtml(extracted.definitions.get(id) || '')}</p>`;
      const back = `<a class="footnote-back" href="#fnref-${anchor}-1" aria-label="返回正文">↩</a>`;
      const withBack = content.includes('</p>') ? content.replace(/<\/p>(?![\s\S]*<\/p>)/, ` ${back}</p>`) : `${content} ${back}`;
      return `<li id="fn-${anchor}"><div class="footnote-content">${withBack}</div></li>`;
    });
    referenced.order.forEach((id, index) => {
      const number = index + 1;
      const anchor = footnoteAnchor(id);
      html = html.replace(new RegExp(`ALICIA_FNREF_${index}_(\\d+)`, 'g'), (_match, occurrence) => (
        `<sup class="footnote-ref" id="fnref-${anchor}-${occurrence}"><a href="#fn-${anchor}" aria-describedby="fn-${anchor}">${number}</a></sup>`
      ));
    });
    html += `<section class="article-footnotes" aria-label="脚注"><p>脚注</p><ol>${items.join('')}</ol></section>`;
  }

  return { slug: slugFromFile(filename), title, date, description, tags: [...new Set(metadata.tags || [])], section, format, readingMinutes: Math.max(1, Math.ceil(chineseCharacters / 350 + words / 220)), html, headings };
}
