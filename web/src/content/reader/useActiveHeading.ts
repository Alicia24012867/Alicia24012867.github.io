import { useEffect, useState, type RefObject } from 'react';
import type { Article } from '../types';
import { headingAt, type HeadingPosition } from './headingPosition';

export function useActiveHeading(
  bodyRef: RefObject<HTMLElement | null>,
  headings: Article['headings'],
) {
  const [active, setActive] = useState(headings[0]?.id ?? '');
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const ids = new Set(headings.map((heading) => heading.id));
    const nodes = [...root.querySelectorAll<HTMLElement>('h2[id], h3[id]')].filter((node) =>
      ids.has(node.id),
    );
    setActive(nodes[0]?.id ?? '');
    if (!nodes.length) return;
    let frame = 0;
    let dirty = true;
    let disposed = false;
    let positions: HeadingPosition[] = [];
    let offset = 0;
    let bottom = 0;

    const update = () => {
      if (frame || disposed) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (dirty) {
          const visible = nodes.filter((heading) => heading.getClientRects().length > 0);
          positions = visible.map((heading) => ({
            id: heading.id,
            top: heading.getBoundingClientRect().top + window.scrollY,
          }));
          offset =
            (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) +
            (visible[0]
              ? Number.parseFloat(getComputedStyle(visible[0]).scrollMarginTop) || 0
              : 0) +
            1;
          bottom = document.documentElement.scrollHeight - window.innerHeight;
          dirty = false;
        }
        const atEnd = window.scrollY > 0 && Math.ceil(window.scrollY) >= bottom;
        setActive(
          atEnd ? (positions.at(-1)?.id ?? '') : headingAt(positions, window.scrollY + offset),
        );
      });
    };
    const invalidate = () => {
      dirty = true;
      update();
    };
    const observer = new ResizeObserver(invalidate);
    observer.observe(root);
    observer.observe(root.closest('.reading-page') ?? root);
    observer.observe(document.body);
    root.addEventListener('toggle', invalidate, true);
    document.fonts?.ready.then(() => {
      if (!disposed) invalidate();
    });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', invalidate);
    window.addEventListener('hashchange', invalidate);
    update();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener('toggle', invalidate, true);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('hashchange', invalidate);
    };
  }, [bodyRef, headings]);
  return active;
}
