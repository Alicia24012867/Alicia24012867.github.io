import { sharePath } from '../../src/config/sharing.mjs';
import { lastModified } from './metadata.mjs';
import { serveGenerated } from './serve.mjs';
import { xml, declaration } from './xml.mjs';

/**
 * Catalogs already exclude drafts/private files and resolve authored or Git dates. Locked
 * documents stay out: their pages hold only a password form.
 */
export function renderSitemap(collections, siteUrl) {
  const urls = new Map([[new URL('/', siteUrl).href, '']]);
  for (const { basePath, articles } of collections) {
    urls.set(new URL(basePath, siteUrl).href, '');
    for (const article of articles)
      if (!article.locked)
        urls.set(new URL(sharePath(basePath, article.slug), siteUrl).href, lastModified(article));
  }
  return `${declaration}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls].map(([url, date]) => `  <url><loc>${xml(url)}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`).join('\n')}
</urlset>\n`;
}

export const renderRobots = (siteUrl) =>
  `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', siteUrl).href}\n`;

/** Reuse each content plugin's cached catalog in builds and local development. */
export function sitemapPlugin(collections, siteUrl) {
  let previous = [];
  let sitemap;
  const robots = renderRobots(siteUrl);
  const readSitemap = () => {
    const catalogs = collections.map(({ readCatalog }) => readCatalog());
    if (!sitemap || catalogs.some((catalog, index) => catalog !== previous[index])) {
      sitemap = renderSitemap(
        catalogs.map((catalog, index) => ({
          basePath: collections[index].basePath,
          articles: catalog.articles,
        })),
        siteUrl,
      );
      previous = catalogs;
    }
    return sitemap;
  };
  return {
    name: 'site-sitemap',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: readSitemap() });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
    },
    configureServer(server) {
      const documents = new Map([
        ['/sitemap.xml', { type: 'application/xml', read: readSitemap }],
        ['/robots.txt', { type: 'text/plain', read: () => robots }],
      ]);
      server.middlewares.use((req, res, next) => {
        const document = documents.get(new URL(req.url, 'http://localhost').pathname);
        if (!document) return next();
        serveGenerated(req, res, next, document.type, document.read);
      });
    },
  };
}
