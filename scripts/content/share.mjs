import fs from 'node:fs';
import path from 'node:path';
import {
  cardCollections,
  collectionByBase,
  requireCard,
  requireSiteCard,
  sharePath,
  skyDigest,
} from '../share/spec.mjs';

export const SITE_TITLE = 'Alicia · Between code and blue skies';
export const SITE_DESCRIPTION =
  'Alicia’s personal corner of the web. Interests, discoveries, and curiosity.';

/** Vite reports entry paths with and without the file name, depending on the mode. */
export const entryRoute = (pathname) => pathname.replace(/index\.html$/, '');

export const escapeAttribute = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function replaceOnce(html, pattern, replacement, label) {
  const next = html.replace(pattern, replacement);
  if (next === html)
    throw new Error('分享页模板缺少 ' + label + '，请检查对应的 HTML 入口是否仍然包含该标签');
  return next;
}

const metaTag = (attribute, key, content) =>
  '    <meta ' + attribute + '="' + key + '" content="' + escapeAttribute(content) + '" />';

const metaPattern = (attribute, key) =>
  new RegExp('<meta\\s+' + attribute + '="' + key + '"\\s+content="[^"]*"\\s*/?>');

/** Article-specific head, cloned into a real static page for every published document. */
export function sharePageHtml(shell, article, { siteUrl, basePath, card }) {
  const site = new URL(siteUrl);
  const collection = collectionByBase.get(basePath);
  if (!collection) throw new Error('未知的分享目录：' + basePath);
  const canonical = new URL(sharePath(basePath, article.slug), site).href;
  const image = new URL(card.url, site).href;
  const description = article.description || collection.tagline;
  const title = article.title + collection.titleSuffix;
  const section = collection.sections.byId(article.section);
  const cardAlt = 'Share card for ' + article.title;
  const head = [
    { attribute: 'property', key: 'og:title', content: title },
    { attribute: 'property', key: 'og:description', content: description },
    { attribute: 'property', key: 'og:type', content: 'article' },
    { attribute: 'property', key: 'og:url', content: canonical },
    { attribute: 'property', key: 'og:image', content: image },
    { attribute: 'property', key: 'og:image:alt', content: cardAlt },
    { attribute: 'name', key: 'twitter:title', content: title },
    { attribute: 'name', key: 'twitter:description', content: description },
    { attribute: 'name', key: 'twitter:image', content: image },
    { attribute: 'name', key: 'twitter:image:alt', content: cardAlt },
  ];
  const articleMeta = [
    metaTag('property', 'article:published_time', new Date(article.date).toISOString()),
    metaTag(
      'property',
      'article:modified_time',
      new Date(article.updated || article.date).toISOString(),
    ),
    metaTag('property', 'article:author', article.author || 'Alicia'),
    metaTag('property', 'article:section', section.label),
    ...article.tags.map((tag) => metaTag('property', 'article:tag', tag)),
  ].join('\n');

  let html = shell;
  html = replaceOnce(
    html,
    /<title>[^<]*<\/title>/,
    '<title>' + escapeAttribute(title) + '</title>',
    '<title>',
  );
  html = replaceOnce(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    '    <meta name="description" content="' + escapeAttribute(description) + '" />',
    'description',
  );
  html = replaceOnce(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    '    <link rel="canonical" href="' + escapeAttribute(canonical) + '" />',
    'canonical',
  );
  for (const { attribute, key, content: value } of head)
    html = replaceOnce(html, metaPattern(attribute, key), metaTag(attribute, key, value), key);
  html = replaceOnce(
    html,
    // Prettier may keep the closing ">" of the noscript tag on its own line.
    /<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/,
    '<noscript>' +
      escapeAttribute(title) +
      ' — ' +
      escapeAttribute(description) +
      ' <a href="' +
      escapeAttribute(canonical) +
      '">Open the article</a>.</noscript>',
    '<noscript>',
  );
  return replaceOnce(html, /<\/head>/, articleMeta + '\n  </head>', '</head>');
}

/**
 * Every published document gets a real static page and a matching title card, so
 * link previews and crawlers never need JavaScript. Entry pages carry the site
 * defaults; each clone rewrites them for one article.
 */
export function sharePlugin(collections, { siteUrl }) {
  const site = new URL(siteUrl);
  const routes = new Map(
    ['/', ...cardCollections.map((collection) => collection.basePath)].map((route) => [
      route,
      route === '/' ? site.href : new URL(route, site).href,
    ]),
  );
  let publicRoot = 'public';
  let sky;
  let siteCard;
  const readSky = () => (sky ??= skyDigest(publicRoot));
  const readSiteCard = () => (siteCard ??= requireSiteCard({ publicRoot, sky: readSky() }));
  const collectionFor = (basePath) => collections.find((item) => item.basePath === basePath);

  const cardTags = () => {
    const image = new URL(readSiteCard().url, site).href;
    return [
      { tag: 'meta', attrs: { property: 'og:image', content: image } },
      { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
      { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
      { tag: 'meta', attrs: { property: 'og:image:alt', content: SITE_TITLE } },
      { tag: 'meta', attrs: { property: 'og:site_name', content: 'Alicia' } },
      { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
      { tag: 'meta', attrs: { name: 'twitter:title', content: SITE_TITLE } },
      { tag: 'meta', attrs: { name: 'twitter:description', content: SITE_DESCRIPTION } },
      { tag: 'meta', attrs: { name: 'twitter:image', content: image } },
      { tag: 'meta', attrs: { name: 'twitter:image:alt', content: SITE_TITLE } },
    ];
  };

  /** /blog/<slug>/ and /notes/<slug>/ only; every other path keeps Vite's behaviour. */
  const matchShare = (pathname) => {
    for (const { basePath } of collections) {
      if (!pathname.startsWith(basePath)) continue;
      const rest = pathname.slice(basePath.length);
      if (!rest.endsWith('/')) continue;
      const encoded = rest.slice(0, -1);
      if (!encoded) continue;
      try {
        return { basePath, slug: encoded.split('/').map(decodeURIComponent).join('/') };
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  const readArticle = (match) =>
    collectionFor(match.basePath)
      ?.readCatalog()
      .articles.find((article) => article.slug === match.slug);

  const pageFile = (basePath, slug) =>
    basePath.slice(1) + sharePath(basePath, slug).slice(basePath.length) + 'index.html';

  return {
    name: 'site-share',
    // Post order so the built entry pages already exist in the bundle when the
    // static share pages are cloned from them.
    enforce: 'post',
    configResolved(config) {
      publicRoot = path.resolve(config.root, 'public');
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const canonical = routes.get(entryRoute(context.path));
        if (!canonical) return html;
        return {
          html,
          tags: [
            { tag: 'link', attrs: { rel: 'canonical', href: canonical }, injectTo: 'head' },
            { tag: 'meta', attrs: { property: 'og:url', content: canonical }, injectTo: 'head' },
            ...cardTags().map((tag) => ({ ...tag, injectTo: 'head' })),
          ],
        };
      },
    },
    generateBundle(_options, bundle) {
      for (const { basePath, readCatalog } of collections) {
        const shell = bundle[basePath.slice(1) + 'index.html']?.source;
        if (typeof shell !== 'string')
          throw new Error('分享页需要先构建 ' + basePath + 'index.html 入口');
        for (const article of readCatalog().articles) {
          const card = requireCard(article, basePath, { publicRoot, sky: readSky() });
          this.emitFile({
            type: 'asset',
            fileName: pageFile(basePath, article.slug),
            source: sharePageHtml(shell, article, { siteUrl, basePath, card }),
          });
        }
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        let pathname;
        try {
          pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        } catch {
          return next();
        }
        const match = matchShare(pathname);
        if (!match) return next();
        const article = readArticle(match);
        if (!article) return next();
        try {
          const shell = await fs.promises.readFile(
            path.join(server.config.root, match.basePath, 'index.html'),
            'utf8',
          );
          const card = requireCard(article, match.basePath, { publicRoot, sky: readSky() });
          const html = sharePageHtml(
            await server.transformIndexHtml(match.basePath, shell),
            article,
            { siteUrl, basePath: match.basePath, card },
          );
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(req.method === 'HEAD' ? undefined : html);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
