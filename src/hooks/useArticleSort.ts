import { useCallback, useEffect, useState } from 'react';
import { sortFromSearch, type ArticleSort } from '../content/sort';

export function useArticleSort(): [ArticleSort, (sort: ArticleSort) => void] {
  const [sort, setSort] = useState(() => sortFromSearch(window.location.search));

  useEffect(() => {
    const restore = () => setSort(sortFromSearch(window.location.search));
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  const updateSort = useCallback((next: ArticleSort) => {
    const url = new URL(window.location.href);
    if (next === 'newest') url.searchParams.delete('sort');
    else url.searchParams.set('sort', next);
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
    setSort(next);
  }, []);

  return [sort, updateSort];
}
