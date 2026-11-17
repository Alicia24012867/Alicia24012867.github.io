import { useEffect, useState, type ComponentType, type RefObject } from 'react';
import type { GiscusProps } from '@giscus/react';
import { commentTheme } from '../content/reader/comments';
import { useNearLoad } from './useNearLoad';

const loadGiscus = () =>
  import('@giscus/react').then(({ default: Giscus }) => Giscus as ComponentType<GiscusProps>);

/**
 * The giscus widget and its dependencies are fetched once `container` is about a screen and
 * a half away, so it has usually settled before the reader reaches it. The widget follows
 * the site theme, and `backlink` tells the discussion where it lives.
 */
export function useCommentWidget(container: RefObject<HTMLElement | null>, backlink: string) {
  // The widget comes from giscus.app, so without a connection it waits for one.
  const { value: Widget, failed, offline } = useNearLoad(container, loadGiscus);
  const [theme, setTheme] = useState(() => commentTheme(document.documentElement.dataset.theme));

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
