import { xml, declaration } from './xml.mjs';

/** Catalogs already exclude drafts/private files and resolve authored or Git dates. */
export function renderSitemap(collections, siteUrl) {
  const urls = new Map([[new URL('/', siteUrl).href, '']]);
  for (const { basePath, articles } of collections) {
    urls.set(new URL(basePath, siteUrl).href, '');
    for (const article of articles) {
      const url = new URL(`${basePath}?post=${encodeURIComponent(article.slug)}`, siteUrl).href;
      const changed = new Date(
        Math.max(Date.parse(article.date), Date.parse(article.updated || article.date)),
      ).toISOString();
      urls.set(url, changed);
    }
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
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (!['/sitemap.xml', '/robots.txt'].includes(pathname)) return next();
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405;
          res.setHeader('Allow', 'GET, HEAD');
          return res.end();
        }
        try {
          const body =
            req.method === 'HEAD' ? undefined : pathname === '/robots.txt' ? robots : readSitemap();
          res.setHeader(
            'Content-Type',
            `${pathname === '/robots.txt' ? 'text/plain' : 'application/xml'}; charset=utf-8`,
          );
          res.setHeader('Cache-Control', 'no-cache');
          res.end(body);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
