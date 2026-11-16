import { useEffect, useState, type ComponentType, type RefObject } from 'react';
import type { GiscusProps } from '@giscus/react';
import { commentTheme } from '../content/reader/comments';

/**
 * The giscus widget and its dependencies are fetched once `container` is about a screen and
 * a half away, so it has usually settled before the reader reaches it. The widget follows
 * the site theme, and `backlink` tells the discussion where it lives.
 */
export function useCommentWidget(container: RefObject<HTMLElement | null>, backlink: string) {
  const [Widget, setWidget] = useState<ComponentType<GiscusProps>>();
  const [failed, setFailed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [theme, setTheme] = useState(() => commentTheme(document.documentElement.dataset.theme));

  useEffect(() => {
    let disposed = false;
    let started = false;
    setFailed(false);
    setOffline(false);
    const load = () => {
      if (started) return;
      // The widget comes from giscus.app, so without a connection it waits for one.
      if (!navigator.onLine) {
        setOffline(true);
        window.addEventListener('online', load);
        return;
      }
      started = true;
      setOffline(false);
      window.removeEventListener('online', load);
      observer?.disconnect();
      import('@giscus/react').then(
        ({ default: Giscus }) => {
          if (!disposed) setWidget(() => Giscus);
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
              if (entries.some((entry) => entry.isIntersecting)) load();
            },
            { rootMargin: '1200px 0px' },
          );
    if (observer && container.current) observer.observe(container.current);
    else load();
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('online', load);
    };
  }, [container]);

  useEffect(() => {
    const syncTheme = () => setTheme(commentTheme(document.documentElement.dataset.theme));
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'giscus:backlink';
    meta.content = backlink;
    document.head.append(meta);
    return () => meta.remove();
  }, [backlink]);

  return { Widget, failed, offline, theme };
}
