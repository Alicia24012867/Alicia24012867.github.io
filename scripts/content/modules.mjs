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
const loaders = new Map([${loaders.join(',')}]);
export function loadArticle(slug) {
  const load = loaders.get(slug);
  return load ? load() : Promise.reject(new Error('Unknown article'));
}
export const loadSearch = () => import(${JSON.stringify(`${moduleId}/search`)}).then(module => module.default);
export default articles;`;
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
  const imports = [...used.values()]
    .map(({ file, name }) => `import ${name} from ${JSON.stringify(`${file}?url`)};`)
    .join('\n');
  const urls = [...used]
    .map(([marker, { name }]) => `${JSON.stringify(marker)}: ${name}`)
    .join(',');
  return `${imports}
const urls = {${urls}};
const body = ${JSON.stringify(body)};
body.html = body.html.replace(/__ALICIA_ARTICLE_ASSET_\\d+__/g, marker => urls[marker]?.replaceAll('&', '&amp;').replaceAll('"', '&quot;') ?? marker);
export default body;`;
}
