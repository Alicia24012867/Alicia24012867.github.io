import { useEffect, type RefObject } from 'react';
import { absoluteUrl } from '../urls';
import type { Article } from '../types';

/**
 * A "#" after each section heading links to that section and copies its address. It is a
 * pointer shortcut, kept out of the accessibility tree and tab order so headings keep their
 * own names; the contents list offers the same links to everyone.
 */
export function useHeadingLinks(bodyRef: RefObject<HTMLElement | null>, article: Article) {
  const page = article.share?.path;
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    let disposed = false;
    const links: HTMLAnchorElement[] = [];
    for (const heading of root.querySelectorAll<HTMLElement>('h2[id], h3[id], h4[id]')) {
      const link = document.createElement('a');
      link.className = 'heading-link';
      link.href = `#${encodeURIComponent(heading.id)}`;
      link.textContent = '#';
      link.tabIndex = -1;
      link.setAttribute('aria-hidden', 'true');
      heading.append(link);
      links.push(link);
    }
    const timers = new Map<HTMLAnchorElement, number>();
    const onClick = async (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>('.heading-link');
      if (!link || !root.contains(link)) return;
      // A modified click opens the section elsewhere; a plain one also copies its address.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const address =
        absoluteUrl(page ?? window.location.pathname + window.location.search) + link.hash;
      try {
        await navigator.clipboard.writeText(address);
      } catch {
        return;
      }
      if (disposed) return;
      window.clearTimeout(timers.get(link));
      link.classList.add('is-copied');
      timers.set(
        link,
        window.setTimeout(() => {
          link.classList.remove('is-copied');
          timers.delete(link);
        }, 1800),
      );
    };
    root.addEventListener('click', onClick);
    return () => {
      disposed = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      root.removeEventListener('click', onClick);
      links.forEach((link) => link.remove());
    };
  }, [bodyRef, article.html, page]);
}
