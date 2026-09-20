import { useEffect, useState } from 'react';
import { loadSearchIndex, noteIndex } from './catalog';

export function useNoteSearch(query: string) {
  const [index, setIndex] = useState<typeof noteIndex>();
  const [failed, setFailed] = useState(false);
  const searching = !!query.trim();

  useEffect(() => {
    if (!searching || index) return;
    let cancelled = false;
    setFailed(false);
    loadSearchIndex()
      .then((result) => {
        if (!cancelled) setIndex(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [searching, index]);

  return {
    index: index ?? noteIndex,
    pending: searching && !index && !failed,
    failed: searching && !index && failed,
    retry: () => window.location.reload(),
  };
}
