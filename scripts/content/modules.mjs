import { sharePath } from '../../src/config/sharing.mjs';

/**
 * What a listing may say about a locked document: its address, title, dates and section. The
 * rest is in its sealed file, at `url`, with placeholders here so every reader keeps one shape.
 */
function lockedSummary({ slug, title, date, updated, pin, section, share }, url) {
  return {
    slug,
    title,
    date,
    updated,
    pin,
    description: '',
    tags: [],
    section,
    format: 'Markdown',
    lang: '',
    readingMinutes: 0,
    wordCount: 0,
    hasMath: false,
    ...(share && { share }),
    locked: url,
  };
}

/**
 * Everything a locked document's reader needs, for sealing: `html` names its sealed files,
 * and `files` gives each one's own name, for saving it.
 */
export function lockedPayload({ searchText, locked, unlisted, share, ...article }, html, files) {
  return { ...article, html, files };
}

/**
 * Small listing metadata and lazy, per-document payloads. Locked documents open from their
 * sealed file, `lockedUrl(slug)`, instead of a module; unlisted ones only from their own page.
 */
export function listingModule({ articles }, moduleId, lockedUrl = () => undefined) {
  const listed = articles.filter((article) => !article.unlisted);
  const summaries = listed.map((article) => {
    if (article.locked) return lockedSummary(article, lockedUrl(article.slug));
    const { html, headings, backlinks, searchText, ...summary } = article;
    return summary;
  });
  const loaders = listed
    .filter((article) => !article.locked)
    .map(
      ({ slug }) =>
        `[${JSON.stringify(slug)}, () => import(${JSON.stringify(`${moduleId}/entry/${encodeURIComponent(slug)}`)}).then(module => module.default)]`,
    );
  return `const articles = ${JSON.stringify(summaries)};
let loaders;
export function loadArticle(slug) {
  loaders ??= new Map([${loaders.join(',')}]);
  const load = loaders.get(slug);
  return load ? load() : Promise.reject(new Error('Unknown article'));
}
export const loadSearch = () => import(${JSON.stringify(`${moduleId}/search`)}).then(module => module.default);
export default articles;`;
}

/** Only the newest document's title, date and address, for pages that just link to it. */
export function latestModule({ articles }, basePath) {
  const latest = articles.find((article) => !article.unlisted);
  const summary = latest && {
    title: latest.title,
    date: latest.date,
    path: sharePath(basePath, latest.slug),
  };
  return `export default ${JSON.stringify(summary ?? null)};`;
}

/** Each document's slug and title, for suggesting one to a page that got its address wrong. */
export function titlesModule({ articles }) {
  const listed = articles.filter((article) => !article.unlisted);
  return `export default ${JSON.stringify(listed.map(({ slug, title }) => [slug, title]))};`;
}

/** Full text for searching; a locked document's text never leaves its sealed file. */
export function searchModule({ articles }) {
  const open = articles.filter((article) => !article.locked);
  return `export default ${JSON.stringify(Object.fromEntries(open.map((article) => [article.slug, article.searchText])))};`;
}

export function articleModule(article, assetsByMarker) {
  const used = new Map();
  const body = { html: article.html, headings: article.headings, backlinks: article.backlinks };
  // Import only this document's assets; unrelated attachments stay out of its dependency graph.
  for (const [marker] of body.html.matchAll(/__ALICIA_ARTICLE_ASSET_\d+__/g)) {
    const file = assetsByMarker.get(marker);
    if (file && !used.has(marker)) used.set(marker, { file, name: `asset${used.size}` });
  }
  if (!used.size) return `export default ${JSON.stringify(body)};`;
  const imports = [...used.values()]
    .map(({ file, name }) => `import ${name} from ${JSON.stringify(`${file}?url`)};`)
    .join('\n');
  const urls = [...used]
    .map(([marker, { name }]) => `${JSON.stringify(marker)}: ${name}`)
    .join(',');
  // Spaces would split a srcset list, so addresses keep them percent-encoded.
  return `${imports}
const urls = {${urls}};
const body = ${JSON.stringify(body)};
body.html = body.html.replace(/__ALICIA_ARTICLE_ASSET_\\d+__/g, marker => urls[marker]?.replace(/\\s/g, encodeURIComponent).replaceAll('&', '&amp;').replaceAll('"', '&quot;') ?? marker);
export default body;`;
}
