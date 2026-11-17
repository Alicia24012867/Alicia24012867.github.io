import { useEffect, useState, type RefObject } from 'react';

/**
 * Runs `load` once `container` is about a screen and a half away, so what it fetches has
 * usually settled before the reader gets there. Without a connection it waits for one.
 * `load` should keep the same identity: a new one starts again.
 */
export function useNearLoad<T>(container: RefObject<HTMLElement | null>, load: () => Promise<T>) {
  const [value, setValue] = useState<T>();
  const [failed, setFailed] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let disposed = false;
    let started = false;
    setFailed(false);
    setOffline(false);
    const start = () => {
      if (started) return;
      if (!navigator.onLine) {
        setOffline(true);
        window.addEventListener('online', start);
        return;
      }
      started = true;
      setOffline(false);
      window.removeEventListener('online', start);
      observer?.disconnect();
      load().then(
        (loaded) => {
          if (!disposed) setValue(() => loaded);
        },
        () => {
          if (!disposed) setFailed(true);
        },
      );
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) start();
            },
            { rootMargin: '1200px 0px' },
          );
    if (observer && container.current) observer.observe(container.current);
    else start();
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('online', start);
    };
  }, [container, load]);

  return { value, failed, offline };
}
