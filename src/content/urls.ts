import type { ArticleSort } from './sort';

export const queryFromSearch = (search: string) => new URLSearchParams(search).get('q') ?? '';

/** Carry list preferences, never an arbitrary return URL or a document's heading hash. */
export const listingUrl = (query = '', sort: ArticleSort = 'newest') => {
  const params = [
    query ? `q=${encodeURIComponent(query)}` : '',
    sort !== 'newest' ? `sort=${sort}` : '',
  ].filter(Boolean);
  return params.length ? `./?${params.join('&')}` : './';
};

export const articleUrl = (slug: string, query = '', sort: ArticleSort = 'newest') =>
  `?post=${encodeURIComponent(slug)}${query ? `&q=${encodeURIComponent(query)}` : ''}${sort !== 'newest' ? `&sort=${sort}` : ''}`;
