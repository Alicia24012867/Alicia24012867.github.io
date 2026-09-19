import { useEffect, useState } from 'react';

const readQuery = () => new URLSearchParams(window.location.search).get('q') ?? '';

/** The URL is the durable state; reloading or returning from an article keeps the filter. */
export function useSearchQuery(): [string, (query: string) => void] {
  const [query, setQuery] = useState(readQuery);
  useEffect(() => {
    const restore = () => setQuery(readQuery());
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  const updateQuery = (next: string) => {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('q', next);
    else url.searchParams.delete('q');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    setQuery(next);
  };
  return [query, updateQuery];
}
