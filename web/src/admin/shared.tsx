import { useCallback, useEffect, useState } from 'react';
import { failure } from '../api/client';

export const when = (time: string) =>
  new Date(time).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Loads once, again on `reload()`; `error` is a sentence for the page. */
export function useLoad<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<string>();
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(undefined);
    load().then(
      (loaded) => {
        if (!cancelled) setValue(loaded);
      },
      (problem) => {
        if (!cancelled) setError(failure(problem, 'load this'));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, round]);

  const reload = useCallback(() => setRound((n) => n + 1), []);
  return { value, setValue, error, reload };
}

export function Status({ error, loading }: { error?: string; loading?: boolean }) {
  if (error)
    return (
      <p className="admin-note is-wrong" role="alert">
        {error}
      </p>
    );
  if (loading)
    return (
      <p className="admin-note" role="status">
        Loading…
      </p>
    );
  return null;
}
