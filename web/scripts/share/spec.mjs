import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { blogSections, noteSections } from '../../src/config/sections.mjs';
import { blogFeed } from '../../src/config/feeds.mjs';
import { encodeSlug, sharePath as encodeSharePath } from '../../src/config/sharing.mjs';

/**
 * Share cards are rendered by scripts/share/render_card.py and committed under
 * public/images/share/. Bump CARD_VERSION whenever the layout, palette or copy
 * changes so every card is rendered again.
 */
export const CARD_VERSION = 2;
// JPEG keeps the photo background small while every link preview understands it.
export const CARD_FORMAT = 'jpeg';
export const cardExtension = (format = CARD_FORMAT) => (format === 'jpeg' ? 'jpg' : format);
export const SHARE_DIRECTORY = 'images/share';
export const SKY_IMAGE = 'images/summer-sky.webp';

export const cardCollections = [
  {
    id: 'blog',
    basePath: '/blog/',
    directory: 'content/blog',
    eyebrow: "ALICIA'S BLOG",
    tagline: 'Code, learning, and little discoveries worth sharing.',
    titleSuffix: ' · Alicia Blog',
    sections: blogSections,
  },
  {
    id: 'notes',
    basePath: '/notes/',
    directory: 'content/notes',
    eyebrow: 'NOTES',
    tagline: 'Formulas, source code, APIs, and algorithms.',
    titleSuffix: ' · Alicia',
    sections: noteSections,
  },
];
export const collectionByBase = new Map(cardCollections.map((item) => [item.basePath, item]));
export const collectionById = new Map(cardCollections.map((item) => [item.id, item]));

export const siteHost = new URL(blogFeed.siteUrl).host;

/** Slugs become real directories: refuse names that could escape the share root. */
export function shareSegments(slug) {
  const segments = String(slug).split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..'))
    throw new Error('文章地址不能作为静态分享地址：' + slug);
  return segments;
}

/** Site-absolute share address, for example /blog/moments/. */
export function sharePath(basePath, slug) {
  shareSegments(slug);
  return encodeSharePath(basePath, slug);
}

/** Path inside public/ that holds the rendered card. */
export function cardRelative(basePath, slug, digest, format = CARD_FORMAT) {
  return (
    [
      SHARE_DIRECTORY,
      collectionByBase.get(basePath).id,
      ...shareSegments(slug).map(encodeURIComponent),
    ].join('/') +
    '.' +
    digest +
    '.' +
    cardExtension(format)
  );
}

export function skyDigest(publicRoot) {
  return createHash('sha256')
    .update(fs.readFileSync(path.join(publicRoot, SKY_IMAGE)))
    .digest('hex')
    .slice(0, 12);
}

/** Text drawn on the card; also the digest input, so any wording change regenerates it. */
export function cardSpec(article, basePath, { host = siteHost } = {}) {
  const collection = collectionByBase.get(basePath);
  const section = collection.sections.byId(article.section);
  return {
    eyebrow: collection.eyebrow + ' / ' + (section.english || section.label).toUpperCase(),
    title: article.title,
    description: article.description || collection.tagline,
    // Git dates change at commit time, after cards have already been rendered.
    signature: article.author || 'Alicia',
    footer: host,
  };
}

export function cardDigest(spec, sky) {
  return createHash('sha256')
    .update(JSON.stringify({ version: CARD_VERSION, spec, sky }))
    .digest('hex')
    .slice(0, 10);
}

/** Card location for one article, without touching the filesystem. */
export function articleCard(
  article,
  basePath,
  { publicRoot, sky = skyDigest(publicRoot), host } = {},
) {
  const spec = cardSpec(article, basePath, { host });
  const digest = cardDigest(spec, sky);
  const relative = cardRelative(basePath, article.slug, digest);
  return {
    spec,
    digest,
    relative,
    file: path.join(publicRoot, relative),
    url: '/' + encodeSlug(relative),
  };
}

/** Listing entries carry their card so client-rendered routes can update their own preview. */
export function summaryShare(article, basePath, { publicRoot, sky = skyDigest(publicRoot) } = {}) {
  return {
    path: sharePath(basePath, article.slug),
    image: articleCard(article, basePath, { publicRoot, sky }).url,
  };
}

export function requireCard(article, basePath, options) {
  const card = articleCard(article, basePath, options);
  if (!fs.existsSync(card.file))
    throw new Error('缺少分享图 ' + card.relative + '，请运行 npm run share:cards 重新生成分享图');
  return card;
}

export function siteCardSpec({ host = siteHost } = {}) {
  return {
    eyebrow: "ALICIA'S HOMEPAGE",
    title: 'Between code and blue skies',
    description:
      'Exploring high-performance computing, scientific computing, and machine learning.',
    signature: 'Alicia',
    footer: host,
  };
}

export function siteCard({ publicRoot, sky = skyDigest(publicRoot), host } = {}) {
  const spec = siteCardSpec({ host });
  const digest = cardDigest(spec, sky);
  const relative = SHARE_DIRECTORY + '/site.' + digest + '.' + cardExtension();
  return { spec, digest, relative, file: path.join(publicRoot, relative), url: '/' + relative };
}

export function requireSiteCard(options) {
  const card = siteCard(options);
  if (!fs.existsSync(card.file))
    throw new Error(
      '缺少首页分享图 ' + card.relative + '，请运行 npm run share:cards 重新生成分享图',
    );
  return card;
}
