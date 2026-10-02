import { feedFormats } from '../../src/config/feeds.mjs';
import { sharePath } from '../../src/config/sharing.mjs';

import { xml, declaration } from './xml.mjs';

/** Summary feeds use the same published catalog as the website, with no runtime dependencies. */
export function renderFeeds(
  articles,
  { siteUrl, title, description, author, language, basePath = '/blog/' },
) {
  const origin = new URL(siteUrl);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password)
    throw new Error('Feed siteUrl must be an absolute HTTP(S) URL without credentials');
  const absolute = (path) => new URL(path, origin).href;
  const home = xml(absolute(basePath));
  const entries = articles
    .map((article) => ({
      ...article,
      // ?post= stays the stable entry id; the link points at the static address.
      id: xml(absolute(`${basePath}?post=${encodeURIComponent(article.slug)}`)),
      url: xml(absolute(sharePath(basePath, article.slug))),
      published: new Date(article.date),
      edited: new Date(article.updated || article.date),
    }))
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
${entry.tags.map((tag) => `      <category>${xml(tag)}</category>`).join('\n')}
    </item>`,
    )
    .join('\n');
  const atomEntries = entries
    .map(
      (entry) => `  <entry>
    <id>${entry.id}</id>
    <title type="text">${xml(entry.title)}</title>
    <link rel="alternate" type="text/html" href="${entry.url}"/>
    <published>${entry.published.toISOString()}</published>
    <updated>${new Date(Math.max(+entry.published, +entry.edited)).toISOString()}</updated>
    <author><name>${xml(entry.author || author)}</name></author>
    <summary type="text">${xml(entry.description)}</summary>
${entry.tags.map((tag) => `    <category term="${xml(tag)}"/>`).join('\n')}
  </entry>`,
    )
    .join('\n');
  return {
    [rss.path]: `${declaration}<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
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
  <id>${xml(absolute(atom.path))}</id>
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
