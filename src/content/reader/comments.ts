import { absoluteUrl, articlePath, type Collection } from '../urls.ts';

/** A stable term merges legacy/query/index URLs into one discussion per document. */
export function commentIdentity(collection: Collection, slug: string) {
  const term = articlePath(collection, slug);
  return { term, backlink: absoluteUrl(term) + '#comments' };
}

export const commentTheme = (theme: string | undefined) =>
  absoluteUrl('/giscus/' + (theme === 'night' ? 'night' : 'day') + '.css');
