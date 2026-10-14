import fs from 'node:fs';
import path from 'node:path';
import { decodeHTML } from 'entities';
import { decodeSlug } from '../../src/config/sharing.mjs';
import { lastModified } from './metadata.mjs';
import { escapeHtml } from './text.mjs';
import {
  cardCollections,
  collectionByBase,
  requireCard,
  requireSiteCard,
  sharePath,
  shareSegments,
  skyDigest,
} from '../share/spec.mjs';

export const SITE_TITLE = 'Alicia · Between code and blue skies';
export const SITE_DESCRIPTION =
  'Alicia’s personal corner of the web. Interests, discoveries, and curiosity.';

/** Vite reports entry paths with and without the file name, depending on the mode. */
export const entryRoute = (pathname) => pathname.replace(/index\.html$/, '');

const metaTag = (attribute, key, content) =>
  '    <meta ' + attribute + '="' + key + '" content="' + escapeHtml(content) + '" />';

/** Open Graph and Twitter tags that every document rewrites, with the value each one takes. */
const headTags = [
  ['property', 'og:title', (page) => page.title],
  ['property', 'og:description', (page) => page.description],
  ['property', 'og:type', () => 'article'],
  ['property', 'og:url', (page) => page.canonical],
  ['property', 'og:image', (page) => page.image],
  ['property', 'og:image:alt', (page) => page.cardAlt],
  ['name', 'twitter:title', (page) => page.title],
  ['name', 'twitter:description', (page) => page.description],
  ['name', 'twitter:image', (page) => page.image],
  ['name', 'twitter:image:alt', (page) => page.cardAlt],
];

/** Each replaced tag in replacement order, with the markup a document puts in its place. */
const slots = [
  {
    label: '<title>',
    pattern: /<title>[^<]*<\/title>/,
    render: (page) => '<title>' + escapeHtml(page.title) + '</title>',
  },
  {
    label: 'description',
    pattern: /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    render: (page) =>
      '    <meta name="description" content="' + escapeHtml(page.description) + '" />',
  },
  {
    label: 'canonical',
    pattern: /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    render: (page) => '    <link rel="canonical" href="' + escapeHtml(page.canonical) + '" />',
  },
  ...headTags.map(([attribute, key, value]) => ({
    label: key,
    pattern: new RegExp('<meta\\s+' + attribute + '="' + key + '"\\s+content="[^"]*"\\s*/?>'),
    render: (page) => metaTag(attribute, key, value(page)),
  })),
  {
    label: '<noscript>',
    // Prettier may keep the closing ">" of the noscript tag on its own line.
    pattern: /<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/,
    render: (page) =>
      '<noscript>' +
      escapeHtml(page.title) +
      ' — ' +
      escapeHtml(page.description) +
      ' <a href="' +
      escapeHtml(page.canonical) +
      '">Open the article</a>.</noscript>',
  },
  { label: '</head>', pattern: /<\/head>/, render: (page) => page.articleMeta + '\n  </head>' },
];

/**
 * Locate the replaced tags once per entry shell rather than twice per document.
 * Each pattern runs on the shell as rewritten so far, exactly like successive
 * single replacements, but leaves a NUL-delimited slot number behind; rendering
 * a document then only joins the static text around its own values.
 */
function compileShell(shell) {
  if (shell.includes('\0')) throw new Error('分享页模板不能包含 NUL 字符');
  let marked = shell;
  slots.forEach(({ label, pattern }, index) => {
    if (!pattern.test(marked))
      throw new Error('分享页模板缺少 ' + label + '，请检查对应的 HTML 入口是否仍然包含该标签');
    marked = marked.replace(pattern, '\0' + index + '\0');
  });
  const parts = marked.split('\0');
  return {
    text: parts.filter((_part, index) => index % 2 === 0),
    renders: parts
      .filter((_part, index) => index % 2 === 1)
      .map((slot) => slots[Number(slot)].render),
  };
}

/**
 * Article-specific head, cloned into a real static page for every published
 * document. Compile one entry shell, then render each document of the collection.
 */
export function createSharePage(shell, { siteUrl, basePath }) {
  const collection = collectionByBase.get(basePath);
  if (!collection) throw new Error('未知的分享目录：' + basePath);
  const site = new URL(siteUrl);
  const { text, renders } = compileShell(shell);
  return (article, card) => {
    const page = {
      title: article.title + collection.titleSuffix,
      description: article.description || collection.tagline,
      canonical: new URL(sharePath(basePath, article.slug), site).href,
      image: new URL(card.url, site).href,
      cardAlt: 'Share card for ' + article.title,
      articleMeta: [
        metaTag('property', 'article:published_time', new Date(article.date).toISOString()),
        metaTag('property', 'article:modified_time', lastModified(article)),
        metaTag('name', 'author', article.author || 'Alicia'),
        metaTag('property', 'article:section', collection.sections.byId(article.section).label),
        ...article.tags.map((tag) => metaTag('property', 'article:tag', tag)),
      ].join('\n'),
    };
    let html = text[0];
    renders.forEach((render, index) => {
      html += render(page) + text[index + 1];
    });
    return html;
  };
}

/** One document from one shell; builds reuse createSharePage across a collection. */
export const sharePageHtml = (shell, article, { siteUrl, basePath, card }) =>
  createSharePage(shell, { siteUrl, basePath })(article, card);

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

  const cardTags = (html) => {
    const image = new URL(readSiteCard().url, site).href;
    const title = decodeHTML(
      html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/)?.[1] || SITE_TITLE,
    );
    const description = decodeHTML(
      html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/)?.[1] || SITE_DESCRIPTION,
    );
    return [
      { tag: 'meta', attrs: { property: 'og:image', content: image } },
      { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
      { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
      { tag: 'meta', attrs: { property: 'og:image:alt', content: SITE_TITLE } },
      { tag: 'meta', attrs: { property: 'og:site_name', content: 'Alicia' } },
      { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
      { tag: 'meta', attrs: { name: 'twitter:title', content: title } },
      { tag: 'meta', attrs: { name: 'twitter:description', content: description } },
      { tag: 'meta', attrs: { name: 'twitter:image', content: image } },
      { tag: 'meta', attrs: { name: 'twitter:image:alt', content: SITE_TITLE } },
    ];
  };

  /** /blog/<slug>/ and /notes/<slug>/ only; every other path keeps Vite's behaviour. */
  const matchShare = (pathname) => {
    for (const { basePath } of collections) {
      if (!pathname.startsWith(basePath)) continue;
      const rest = pathname.slice(basePath.length).replace(/(^|\/)index\.html$/, '$1');
      const encoded = rest.slice(0, -1);
      if (!rest.endsWith('/') || !encoded) continue;
      const slug = decodeSlug(encoded);
      return slug === undefined ? undefined : { basePath, slug };
    }
    return undefined;
  };

  const readArticle = (match) => collectionFor(match.basePath)?.readArticle(match.slug);

  const pageFile = (basePath, slug) =>
    basePath.slice(1) + shareSegments(slug).join('/') + '/index.html';

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
            ...cardTags(html).map((tag) => ({ ...tag, injectTo: 'head' })),
          ],
        };
      },
    },
    generateBundle(_options, bundle) {
      for (const { basePath, readCatalog } of collections) {
        const shell = bundle[basePath.slice(1) + 'index.html']?.source;
        if (typeof shell !== 'string')
          throw new Error('分享页需要先构建 ' + basePath + 'index.html 入口');
        // Compiled after the first card check, so a missing card is still reported first.
        let render;
        for (const article of readCatalog().articles) {
          const card = requireCard(article, basePath, { publicRoot, sky: readSky() });
          render ??= createSharePage(shell, { siteUrl, basePath });
          this.emitFile({
            type: 'asset',
            fileName: pageFile(basePath, article.slug),
            source: render(article, card),
          });
        }
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        let pathname;
        try {
          pathname = new URL(req.url, 'http://localhost').pathname;
        } catch {
          return next();
        }
        const match = matchShare(pathname);
        if (!match) return next();
        try {
          const article = readArticle(match);
          if (!article) return next();
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
