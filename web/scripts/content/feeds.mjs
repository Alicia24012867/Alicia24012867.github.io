import { decodeHTML } from 'entities';
import { feedFormats } from '../../src/config/feeds.mjs';
import { sharePath } from '../../src/config/sharing.mjs';
import { lastModified } from './metadata.mjs';
import { withoutCopies } from './resize.mjs';
import { escapeHtml } from './text.mjs';
import { xml, declaration } from './xml.mjs';

/**
 * Feeds use the same published catalog as the website, with no runtime dependencies.
 * `contentOf(article, url)` gives an entry's full HTML; entries without it carry only the
 * summary.
 */
export function renderFeeds(
  articles,
  { siteUrl, idBaseUrl = siteUrl, title, description, author, language, basePath = '/blog/' },
  contentOf = () => undefined,
) {
  const origin = new URL(siteUrl);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password)
    throw new Error('Feed siteUrl must be an absolute HTTP(S) URL without credentials');
  const absolute = (path) => new URL(path, origin).href;
  const home = xml(absolute(basePath));
  const entries = articles
    .map((article) => {
      const url = absolute(sharePath(basePath, article.slug));
      // Writing in another language than the feed says so, for readers' voices and fonts.
      const lang =
        article.lang && article.lang.toLowerCase() !== language.toLowerCase()
          ? article.lang
          : undefined;
      const content = contentOf(article, url);
      return {
        ...article,
        // ?post= stays the stable entry id; the link points at the static address.
        id: xml(new URL(`${basePath}?post=${encodeURIComponent(article.slug)}`, idBaseUrl).href),
        url: xml(url),
        lang,
        content:
          content === undefined
            ? undefined
            : xml(lang ? `<div lang="${escapeHtml(lang)}">${content}</div>` : content),
        published: new Date(article.date),
        edited: new Date(article.updated || article.date),
      };
    })
    .sort((a, b) => b.published - a.published || a.slug.localeCompare(b.slug));
  // A fixed epoch keeps empty feeds valid and avoids inventing changes on every build.
  const updated = new Date(
    entries.reduce((latest, entry) => Math.max(latest, +entry.published, +entry.edited), 0),
  );
  const [rss, atom] = feedFormats;
  const rssItems = entries
    .map(
      (entry) => `    <item>
      <title>${xml(entry.title)}</title>
      <link>${entry.url}</link>
      <guid isPermaLink="false">${entry.id}</guid>
      <pubDate>${entry.published.toUTCString()}</pubDate>
      <dc:creator>${xml(entry.author || author)}</dc:creator>
      <description>${xml(xml(entry.description))}</description>
${entry.content === undefined ? '' : `      <content:encoded>${entry.content}</content:encoded>\n`}${entry.tags.map((tag) => `      <category>${xml(tag)}</category>`).join('\n')}
    </item>`,
    )
    .join('\n');
  const atomEntries = entries
    .map(
      (entry) => `  <entry${entry.lang ? ` xml:lang="${xml(entry.lang)}"` : ''}>
    <id>${entry.id}</id>
    <title type="text">${xml(entry.title)}</title>
    <link rel="alternate" type="text/html" href="${entry.url}"/>
    <published>${entry.published.toISOString()}</published>
    <updated>${lastModified(entry)}</updated>
    <author><name>${xml(entry.author || author)}</name></author>
    <summary type="text">${xml(entry.description)}</summary>
${entry.content === undefined ? '' : `    <content type="html">${entry.content}</content>\n`}${entry.tags.map((tag) => `    <category term="${xml(tag)}"/>`).join('\n')}
  </entry>`,
    )
    .join('\n');
  return {
    [rss.path]: `${declaration}<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xml(title)}</title>
    <link>${home}</link>
    <description>${xml(description)}</description>
    <language>${xml(language)}</language>
    <lastBuildDate>${updated.toUTCString()}</lastBuildDate>
    <atom:link href="${xml(absolute(rss.path))}" rel="self" type="${rss.type}"/>
${rssItems}
  </channel>
</rss>\n`,
    [atom.path]: `${declaration}<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${xml(language)}">
  <id>${xml(new URL(atom.path, idBaseUrl).href)}</id>
  <title type="text">${xml(title)}</title>
  <subtitle type="text">${xml(description)}</subtitle>
  <link href="${xml(absolute(atom.path))}" rel="self" type="${atom.type}"/>
  <link href="${home}" rel="alternate" type="text/html"/>
  <updated>${updated.toISOString()}</updated>
  <author><name>${xml(author)}</name></author>
${atomEntries}
</feed>\n`,
  };
}

const markerPattern = /^__ALICIA_ARTICLE_ASSET_\d+__$/;

/**
 * An article's HTML as feed readers show it, without the site's styles or scripts: photos
 * at full size, full addresses, plain code blocks and tables, formulas as MathML, and a link
 * to the post where the site draws a diagram or an interactive figure. `assetUrl` names the
 * file behind an attachment marker; `copies` are the markers of resized photo copies.
 */
export function feedHtml(html, { url, assetUrl, copies = new Set() }) {
  const onSite = (text) => `<p><a href="${escapeHtml(url)}">${text}</a></p>`;
  html = withoutCopies(html, copies)
    .replace(/<figure class="article-mermaid">[\s\S]*?<\/figure>/g, () =>
      onSite('View this diagram on the website.'),
    )
    .replace(/<figure\b[^>]*\sdata-figure="[^"]*"[^>]*><\/figure>/g, () =>
      onSite('Try this interactive figure on the website.'),
    )
    .replace(/<button type="button" class="copy-code"[^>]*>Copy<\/button>/g, '')
    .replace(
      /<pre\b([^>]*)>/g,
      (_tag, attributes) => `<pre${/\slang="[^"]*"/.exec(attributes)?.[0] ?? ''}>`,
    )
    .replace(/<div class="article-table"[^>]*>(?=<table\b)/g, '')
    .replaceAll('</table></div>', '</table>')
    .replace(/<input type="checkbox"[^>]*>/g, (tag) => (/\schecked\b/.test(tag) ? '☑' : '☐'))
    .replace(/\sstyle="--ratio: [^"]*"/g, '');
  // Fragment links stay within the entry; every other address is written out in full.
  const address = (attribute, start, value) => {
    const written = decodeHTML(value);
    if (written.startsWith('#')) return attribute;
    try {
      const resolved = markerPattern.test(written) ? assetUrl(written) : written;
      return `${start}${escapeHtml(new URL(resolved, url).href)}"`;
    } catch {
      return attribute;
    }
  };
  return mathML(html).replace(/<(?:a|img)\b[^>]*>/g, (tag) =>
    tag.replace(/(\s(?:href|src)=")([^"]*)"/g, address),
  );
}

// KaTeX writes each formula twice: MathML, and spans that only its stylesheet lays out.
// Feed readers have no such stylesheet, so they get the MathML alone.
function mathML(html) {
  let shown = '';
  let at = 0;
  for (let start; (start = html.indexOf('<span class="katex">', at)) >= 0; ) {
    const end = closingSpan(html, start);
    const formula = html.slice(start, end);
    shown += html.slice(at, start) + (/<math\b[\s\S]*<\/math>/.exec(formula)?.[0] ?? formula);
    at = end;
  }
  shown += html.slice(at);
  return shown.replace(/<span class="katex-display">(<math\b[\s\S]*?<\/math>)<\/span>/g, '$1');
}

function closingSpan(html, start) {
  const tags = /<(\/?)span\b[^>]*>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (const tag of html.matchAll(tags)) {
    depth += tag[1] ? -1 : 1;
    if (!depth) return tag.index + tag[0].length;
  }
  return html.length;
}
