import { useEffect, useState, type RefObject } from 'react';
import type { Article } from '../../content/types';
import { headingAt, type HeadingPosition } from './headingPosition';

type BodyRef = RefObject<HTMLElement | null>;

function useActiveHeading(bodyRef: BodyRef, article: Article) {
  const [active, setActive] = useState(article.headings[0]?.id ?? '');
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const ids = new Set(article.headings.map((heading) => heading.id));
    const headings = [...root.querySelectorAll<HTMLElement>('h2[id], h3[id]')].filter((node) =>
      ids.has(node.id),
    );
    setActive(headings[0]?.id ?? '');
    if (!headings.length) return;
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
          const visible = headings.filter((heading) => heading.getClientRects().length > 0);
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
  }, [bodyRef, article]);
  return active;
}

function useCodeCopy(bodyRef: BodyRef, slug: string) {
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    let disposed = false;
    const timers = new Map<HTMLButtonElement, number>();
    const onClick = async (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>('.copy-code');
      if (!button || !root.contains(button) || button.disabled) return;
      window.clearTimeout(timers.get(button));
      button.disabled = true;
      button.setAttribute('aria-live', 'polite');
      let status = 'Copied';
      try {
        const code =
          button.closest('.article-mermaid')?.querySelector('.mermaid-source')?.textContent ??
          button.closest('pre')?.querySelector('code')?.textContent ??
          '';
        await navigator.clipboard.writeText(code);
      } catch {
        status = 'Copy failed';
      }
      if (disposed) return;
      button.disabled = false;
      button.textContent = status;
      button.setAttribute('aria-label', status);
      timers.set(
        button,
        window.setTimeout(() => {
          button.textContent = 'Copy';
          button.setAttribute('aria-label', 'Copy code');
          timers.delete(button);
        }, 2000),
      );
    };
    root.addEventListener('click', onClick);
    return () => {
      disposed = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      root.removeEventListener('click', onClick);
    };
  }, [bodyRef, slug]);
}

function useMermaid(bodyRef: BodyRef, slug: string) {
  useEffect(() => {
    const root = bodyRef.current;
    const diagrams = root ? [...root.querySelectorAll<HTMLElement>('.article-mermaid')] : [];
    if (!root || !diagrams.length) return;
    let disposed = false;
    let generation = 0;
    let frame = 0;
    const nearby = new Set<HTMLElement>();
    const pending = new WeakMap<HTMLElement, number>();
    const draw = async () => {
      const theme = document.documentElement.dataset.theme === 'night' ? 'night' : 'day';
      const current = generation;
      const blocks = [...nearby].filter(
        (block) => block.dataset.renderedTheme !== theme && pending.get(block) !== current,
      );
      if (!blocks.length) return;
      blocks.forEach((block) => pending.set(block, current));
      const aborted = () => disposed || current !== generation;
      try {
        const { renderMermaidDiagrams } = await import('./renderMermaid');
        if (!aborted()) await renderMermaidDiagrams(blocks, theme, aborted);
      } catch {
        if (!aborted())
          blocks.forEach((block) => {
            block.classList.remove('is-rendered');
            block.classList.add('is-error');
          });
      } finally {
        blocks.forEach((block) => {
          if (pending.get(block) === current) pending.delete(block);
        });
      }
    };
    const schedule = () => {
      if (frame || disposed) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        void draw();
      });
    };
    const viewport =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const block = entry.target as HTMLElement;
                if (entry.isIntersecting) nearby.add(block);
                else nearby.delete(block);
              }
              schedule();
            },
            { rootMargin: '300px 0px' },
          );
    if (viewport) diagrams.forEach((block) => viewport.observe(block));
    else {
      diagrams.forEach((block) => nearby.add(block));
      schedule();
    }

    const themeObserver = new MutationObserver(() => {
      generation++;
      schedule();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      viewport?.disconnect();
      themeObserver.disconnect();
    };
  }, [bodyRef, slug]);
}

export function useArticleReader(bodyRef: BodyRef, article: Article) {
  useEffect(() => {
    if (!window.location.hash) return;
    let anchor: string;
    try {
      anchor = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    const frame = requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [article.slug]);
  useCodeCopy(bodyRef, article.slug);
  useMermaid(bodyRef, article.slug);
  return useActiveHeading(bodyRef, article);
}
