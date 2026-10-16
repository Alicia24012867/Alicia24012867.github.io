import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import Icon from '../../components/Icon';
import type { Article } from '../types';
import { textLanguage } from '../language.mjs';
import { holdPlace } from './hold';
import { readingProgress } from './progress';
import {
  finishedAt,
  placeAt,
  readBookmarks,
  scrollToPlace,
  sectionAt,
  startedAt,
  writeBookmark,
  type Bookmark,
} from './resume';

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/** The visible page below the header, the article, and each of its top-level blocks. */
function measure(root: HTMLElement) {
  const viewTop = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
  const blocks = [...root.children].map((child) => {
    const { top, height } = child.getBoundingClientRect();
    return { top, height };
  });
  const { top, height } = root.getBoundingClientRect();
  const progress = readingProgress(top, height, viewTop, window.innerHeight);
  return { viewTop, viewBottom: window.innerHeight, article: { top, height }, blocks, progress };
}

/** The section being read, decided on the same line the contents list uses. */
function sectionOf(root: HTMLElement, headings: Article['headings']) {
  const ids = new Set(headings.map((heading) => heading.id));
  const nodes = [...root.querySelectorAll<HTMLElement>('h2[id], h3[id]')].filter(
    (node) => ids.has(node.id) && node.getClientRects().length > 0,
  );
  if (!nodes.length) return undefined;
  const threshold =
    (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) +
    (Number.parseFloat(getComputedStyle(nodes[0]).scrollMarginTop) || 0) +
    1;
  const tops = nodes.map((node) => ({ id: node.id, top: node.getBoundingClientRect().top }));
  return sectionAt(tops, threshold);
}

/** Scrolls back to a saved place and holds it while content above it settles. */
function returnTo(root: HTMLElement, bookmark: Bookmark) {
  return holdPlace(root, () => {
    const view = measure(root);
    const distance = scrollToPlace(
      bookmark,
      view.blocks,
      view.article,
      view.viewTop,
      view.viewBottom,
    );
    return Math.max(0, window.scrollY + distance);
  });
}

/**
 * Remembers, in this browser only, where the reader stopped in each document. Coming back
 * to the top of one left part-way offers a way back to that spot; finishing it, scrolling
 * back to its top or dismissing the offer forgets the place.
 */
export default function ContinueReading({
  bodyRef,
  article,
}: {
  bodyRef: RefObject<HTMLElement | null>;
  article: Article;
}) {
  const page = article.share?.path ?? window.location.pathname;
  const { headings } = article;
  const [offer, setOffer] = useState<Bookmark | null>(null);
  // Nothing is saved while a place is on offer, so a look around the top cannot replace it.
  const holding = useRef(false);
  const returning = useRef<(() => void) | undefined>(undefined);
  const close = useCallback(() => {
    holding.current = false;
    setOffer(null);
  }, []);
  useEffect(() => () => returning.current?.(), []);

  useEffect(() => {
    // A link to a section or footnote already says where to read.
    const saved = window.location.hash ? undefined : readBookmarks(storage())[page];
    holding.current = !!saved;
    if (!saved) return;
    // The browser may restore its own scroll position first, as it does on a reload.
    const timer = window.setTimeout(() => {
      const root = bodyRef.current;
      if (root && measure(root).progress < startedAt && !window.location.hash) setOffer(saved);
      else holding.current = false;
    }, 700);
    return () => window.clearTimeout(timer);
  }, [bodyRef, page]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    let timer = 0;
    const save = () => {
      window.clearTimeout(timer);
      timer = 0;
      if (holding.current) return;
      const view = measure(root);
      const place = placeAt(view.blocks, view.viewTop);
      const reading = place && view.progress >= startedAt && view.progress < finishedAt;
      writeBookmark(
        storage(),
        page,
        reading
          ? {
              ...place,
              blocks: view.blocks.length,
              progress: view.progress,
              heading: sectionOf(root, headings),
              at: Date.now(),
            }
          : undefined,
      );
    };
    const onScroll = () => {
      timer ||= window.setTimeout(save, 400);
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [bodyRef, page, headings]);

  useEffect(() => {
    if (!offer) return;
    // Scrolling well away or following a link within the page means the reader moved on.
    const start = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - start) > window.innerHeight * 0.75) close();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('hashchange', close);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('hashchange', close);
    };
  }, [offer, close]);

  if (!offer) return null;
  const resume = () => {
    const root = bodyRef.current;
    close();
    if (root) returning.current = returnTo(root, offer);
  };
  const dismiss = () => {
    writeBookmark(storage(), page, undefined);
    close();
  };
  const section = headings.find((heading) => heading.id === offer.heading)?.text;
  return (
    <div className="continue-reading">
      <button type="button" className="continue-reading-jump" onClick={resume}>
        <Icon name="down" />
        Continue reading{' '}
        {section && (
          <span className="continue-reading-section" lang={textLanguage(section)}>
            {section}
          </span>
        )}
      </button>
      <button
        type="button"
        className="icon-button continue-reading-close"
        aria-label="Dismiss"
        onClick={dismiss}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
