// Static share addresses stay identical in the site, the build and the content pipeline.
// Every published document lives at <base><slug>/ instead of a query parameter.
export const shareBases = { blog: '/blog/', notes: '/notes/' };

/** @param {string} slug */
export const encodeSlug = (slug) =>
  String(slug)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

/** @param {string} basePath @param {string} slug */
export const sharePath = (basePath, slug) => basePath + encodeSlug(slug) + '/';
