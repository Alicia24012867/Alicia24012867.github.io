export const queryFromSearch = (search: string) => new URLSearchParams(search).get('q') ?? '';

/** Carry only the filter, never an arbitrary return URL or a document's heading hash. */
export const listingUrl = (query = '') => (query ? `./?q=${encodeURIComponent(query)}` : './');

export const articleUrl = (slug: string, query = '') =>
  `?post=${encodeURIComponent(slug)}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
