import { sharePath } from '../../src/config/sharing.mjs';

/** Small listing metadata and lazy, per-document payloads. */
export function listingModule({ articles }, moduleId) {
  const summaries = articles.map(
    ({ html, headings, backlinks, searchText, ...summary }) => summary,
  );
  const loaders = articles.map(
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
  const [latest] = articles;
  const summary = latest && {
    title: latest.title,
    date: latest.date,
    path: sharePath(basePath, latest.slug),
  };
  return `export default ${JSON.stringify(summary ?? null)};`;
}

/** Each document's slug and title, for suggesting one to a page that got its address wrong. */
export function titlesModule({ articles }) {
  return `export default ${JSON.stringify(articles.map(({ slug, title }) => [slug, title]))};`;
}

export function searchModule({ articles }) {
  return `export default ${JSON.stringify(Object.fromEntries(articles.map((article) => [article.slug, article.searchText])))};`;
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
