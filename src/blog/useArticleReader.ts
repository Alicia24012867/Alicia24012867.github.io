import { useEffect, useState, type RefObject } from 'react';
import type { Article } from './types';

type BodyRef = RefObject<HTMLElement | null>;

function useActiveHeading(bodyRef: BodyRef, article: Article) {
  const [active, setActive] = useState(article.headings[0]?.id ?? '');
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const ids = new Set(article.headings.map(heading => heading.id));
    const headings = [...root.querySelectorAll<HTMLElement>('h2[id], h3[id]')].filter(node => ids.has(node.id));
    setActive(headings[0]?.id ?? '');
    if (!headings.length) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const visible = headings.filter(heading => heading.getClientRects().length > 0);
        let current = visible[0]?.id ?? '';
        const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        const margin = visible[0] ? Number.parseFloat(getComputedStyle(visible[0]).scrollMarginTop) || 0 : 0;
        const top = padding + margin + 1;
        for (const heading of visible) {
          if (heading.getBoundingClientRect().top > top) break;
          current = heading.id;
        }
        // A short final section cannot always reach the top of the reading viewport.
        if (window.scrollY > 0 && Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight) {
          current = visible[visible.length - 1]?.id ?? '';
        }
        setActive(current);
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(root);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('hashchange', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('hashchange', update);
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
      let status = '已复制';
      try {
        const code = button.closest('.article-mermaid')?.querySelector('.mermaid-source')?.textContent
          ?? button.closest('pre')?.querySelector('code')?.textContent ?? '';
        await navigator.clipboard.writeText(code);
      } catch {
        status = '复制失败';
      }
      if (disposed) return;
      button.disabled = false;
      button.textContent = status;
      button.setAttribute('aria-label', status);
      timers.set(button, window.setTimeout(() => {
        button.textContent = '复制';
        button.setAttribute('aria-label', '复制代码');
        timers.delete(button);
      }, 2000));
    };
    root.addEventListener('click', onClick);
    return () => {
      disposed = true;
      timers.forEach(timer => window.clearTimeout(timer));
      root.removeEventListener('click', onClick);
    };
  }, [bodyRef, slug]);
}

function useMermaid(bodyRef: BodyRef, slug: string) {
  useEffect(() => {
    const root = bodyRef.current;
    if (!root?.querySelector('.article-mermaid')) return;
    let disposed = false;
    let generation = 0;
    const draw = async () => {
      const current = ++generation;
      const aborted = () => disposed || current !== generation;
      try {
        const { renderMermaidDiagrams } = await import('./renderMermaid');
        if (aborted()) return;
        const theme = document.documentElement.dataset.theme === 'night' ? 'night' : 'day';
        await renderMermaidDiagrams(root, theme, aborted);
      } catch {
        if (aborted()) return;
        // A failed lazy chunk must leave readable, copyable source instead of a rejected promise.
        root.querySelectorAll('.article-mermaid').forEach(block => {
          block.classList.remove('is-rendered');
          block.classList.add('is-error');
        });
      }
    };
    const observer = new MutationObserver(() => { void draw(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    void draw();
    return () => { disposed = true; observer.disconnect(); };
  }, [bodyRef, slug]);
}

export function useArticleReader(bodyRef: BodyRef, article: Article) {
  useEffect(() => {
    if (!window.location.hash) return;
    let anchor: string;
    try { anchor = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    const frame = requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [article.slug]);
  useCodeCopy(bodyRef, article.slug);
  useMermaid(bodyRef, article.slug);
  return useActiveHeading(bodyRef, article);
}
