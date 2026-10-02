import { shareBases, sharePath } from '../config/sharing.mjs';
import { blogFeed } from '../config/feeds.mjs';
import type { ArticleSort } from './sort';

export type Collection = keyof typeof shareBases;

export const collectionBase: Record<Collection, string> = shareBases;

export const queryFromSearch = (search: string) => new URLSearchParams(search).get('q') ?? '';

/** Filters stay in the query string; the path alone identifies the page. */
const filterSearch = (query = '', sort: ArticleSort = 'newest') => {
  const params = [
    query ? 'q=' + encodeURIComponent(query) : '',
    sort !== 'newest' ? 'sort=' + sort : '',
  ].filter(Boolean);
  return params.length ? '?' + params.join('&') : '';
};

/** Independent static address of one document, for example /blog/moments/. */
export const articlePath = (collection: Collection, slug: string) =>
  sharePath(collectionBase[collection], slug);

export const articleUrl = (
  collection: Collection,
  slug: string,
  query = '',
  sort: ArticleSort = 'newest',
) => articlePath(collection, slug) + filterSearch(query, sort);

export const listingUrl = (collection: Collection, query = '', sort: ArticleSort = 'newest') =>
  collectionBase[collection] + filterSearch(query, sort);

/**
 * The static address carries the document in its path; ?post= links stay valid
 * for older bookmarks, feeds and in-content links.
 */
export function slugFromLocation(
  collection: Collection,
  location: { pathname: string; search: string } = window.location,
) {
  const base = collectionBase[collection];
  if (location.pathname.startsWith(base)) {
    const rest = location.pathname
      .slice(base.length)
      .replace(/(^|\/)index\.html$/, '$1')
      .replace(/\/+$/, '');
    if (rest) {
      try {
        return rest
          .split('/')
          .map((segment) => decodeURIComponent(segment))
          .join('/');
      } catch {
        return undefined;
      }
    }
  }
  return new URLSearchParams(location.search).get('post') ?? undefined;
}

/** Canonical links keep the production origin even in local previews. */
export const absoluteUrl = (path: string, origin: string = blogFeed.siteUrl) =>
  new URL(path, origin).href;
