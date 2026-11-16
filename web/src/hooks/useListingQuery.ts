import { useCallback, useEffect, useState } from 'react';
import { parseArticleSort, type ArticleSort } from '../content/sort';

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  return { query: params.get('q') ?? '', sort: parseArticleSort(params.get('sort')) };
}

/** Keep filtering and ordering in one URL state, including history restoration. */
export function useListingQuery() {
  const [state, setState] = useState(readQuery);
  useEffect(() => {
    const restore = () => setState(readQuery());
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  const update = useCallback((key: string, value: string) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
    setState(readQuery());
  }, []);
  const setQuery = useCallback((query: string) => update('q', query), [update]);
  const setSort = useCallback(
    (sort: ArticleSort) => update('sort', sort === 'newest' ? '' : sort),
    [update],
  );
  return { ...state, setQuery, setSort };
}
