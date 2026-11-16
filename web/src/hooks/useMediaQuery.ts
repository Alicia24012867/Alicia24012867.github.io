import { useSyncExternalStore } from 'react';

type MediaStore = { subscribe: (onChange: () => void) => () => void; matches: () => boolean };

// One store per query keeps the subscription stable across renders, so React does
// not resubscribe, and snapshots reuse one MediaQueryList instead of creating more.
const stores = new Map<string, MediaStore>();

function mediaStore(query: string) {
  let store = stores.get(query);
  if (!store) {
    let list: MediaQueryList | undefined;
    const media = () => (list ??= window.matchMedia(query));
    store = {
      subscribe: (onChange) => {
        const target = media();
        target.addEventListener('change', onChange);
        return () => target.removeEventListener('change', onChange);
      },
      matches: () => media().matches,
    };
    stores.set(query, store);
  }
  return store;
}

/** Track a CSS media query; false before the first browser render. */
export function useMediaQuery(query: string) {
  const { subscribe, matches } = mediaStore(query);
  return useSyncExternalStore(subscribe, matches, () => false);
}
