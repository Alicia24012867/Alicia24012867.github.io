import path from 'node:path';

/**
 * The site's code lives in web/, beside the documents it publishes in content/. Paths such as
 * content/blog are named from the repository, as Git and the docs name them.
 */
export const webRoot = path.resolve(import.meta.dirname, '../..');
export const repoRoot = path.dirname(webRoot);
export const contentRoot = path.join(repoRoot, 'content');
