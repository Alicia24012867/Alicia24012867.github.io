import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/Icon';
import type { Article } from '../types';
import { absoluteUrl } from '../urls';
import { holdPlace } from './hold';
import { popoverPlacement } from './popover';
import { findQuote, parseQuote, quoteHash } from './quote';
import { articleText, coveredBy, rangeOf, stretchOf } from './textMap';

/** A link offered for the selected passage. */
type Offer = {
  hash: string;
  passage: string;
  /** The selection it was made for, and where the mouse let go of it. */
  range: Range;
  x?: number;
  share: boolean;
};
type Status = 'ready' | 'copied' | 'failed';
type Place = { left: number; top: number; above: boolean };

/** How long a selection made by touch rests before the link is offered. */
const settleFor = 450;
/** How long "Link copied" stays before the offer goes. */
const shownFor = 1800;

const sameRange = (a: Range, b: Range) =>
  a.compareBoundaryPoints(Range.START_TO_START, b) === 0 &&
  a.compareBoundaryPoints(Range.END_TO_END, b) === 0;

/** Marks the quoted passage; where highlights are not supported, it is selected instead. */
function mark(range: Range) {
  if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
    const highlight = new Highlight(range);
    // Over the lighter marks of a search, the quoted passage shows through.
    highlight.priority = 1;
    CSS.highlights.set('quote', highlight);
    return () => CSS.highlights.delete('quote');
  }
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return () => {
    if (selection?.rangeCount && sameRange(selection.getRangeAt(0), range))
      selection.removeAllRanges();
  };
}

/**
 * The scroll position that puts a passage in the middle of the screen below the header, or
 * its first line near the top when it is taller than that.
 */
function spotFor(range: Range) {
  const header = Math.max(
    document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0,
    0,
  );
  const box = range.getBoundingClientRect();
  const room = window.innerHeight - header;
  const above = box.height < room - 48 ? (room - box.height) / 2 : 24;
  return Math.max(0, window.scrollY + box.top - header - above);
}

const excerpt = (text: string, limit = 280) => {
  const chars = Array.from(text);
  return chars.length > limit
    ? chars
        .slice(0, limit - 1)
        .join('')
        .trimEnd() + '…'
    : text;
};

/**
 * Selecting words in an article offers a link to them: copied with a mouse, or shared from
 * a phone. Opening such a link scrolls to the passage and marks it until the next click or
 * tap. Like the links beside headings, the offer is a pointer shortcut kept out of the
 * accessibility tree, and anyone can still copy the words themselves.
 */
export default function QuoteLinks({
  bodyRef,
  article,
}: {
  bodyRef: RefObject<HTMLElement | null>;
  article: Article;
}) {
  const page = article.share?.path;
  const [offer, setOffer] = useState<Offer | null>(null);
  const [status, setStatus] = useState<Status>('ready');
  const [place, setPlace] = useState<Place | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const current = useRef<Offer | null>(null);
  // Pressing the offer may clear a selection made by touch before the tap lands.
  const pressing = useRef(false);
  const timer = useRef(0);

  const show = useCallback((next: Offer | null) => {
    window.clearTimeout(timer.current);
    pressing.current = false;
    current.current = next;
    setOffer(next);
    setStatus('ready');
  }, []);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    let unmark: (() => void) | undefined;
    let release: (() => void) | undefined;
    const clear = () => {
      release?.();
      unmark?.();
      release = unmark = undefined;
      document.removeEventListener('pointerdown', clear);
    };
    const open = () => {
      clear();
      const quote = parseQuote(window.location.hash);
      if (!quote) return;
      const flat = articleText(root);
      const found = findQuote(flat.text, quote);
      const range = found && rangeOf(flat, found);
      if (!range) return;
      unmark = mark(range);
      release = holdPlace(root, () => spotFor(range));
      document.addEventListener('pointerdown', clear);
    };
    open();
    window.addEventListener('hashchange', open);
    return () => {
      window.removeEventListener('hashchange', open);
      clear();
    };
  }, [bodyRef, article.html]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    // How the reader last pressed on the page, and where a mouse last let go.
    let pointer: string | undefined;
    let dragging = false;
    let x: number | undefined;
    let pending = 0;
    const read = (): Offer | null => {
      const selection = document.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return null;
      const range = selection.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
      const flat = articleText(root);
      const stretch = stretchOf(flat, coveredBy(range));
      if (!stretch) return null;
      return {
        hash: quoteHash(flat.text, stretch),
        passage: flat.text.slice(stretch.from, stretch.to),
        range: range.cloneRange(),
        x: pointer === 'mouse' ? x : undefined,
        share: pointer !== 'mouse' && typeof navigator.share === 'function',
      };
    };
    const offerSoon = (delay: number) => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() => show(read()), delay);
    };
    const unchanged = () => {
      const selection = document.getSelection();
      const offered = current.current;
      return (
        !!offered && !!selection?.rangeCount && sameRange(selection.getRangeAt(0), offered.range)
      );
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && box.current?.contains(event.target)) return;
      pointer = event.pointerType;
      dragging = pointer === 'mouse' && event.button === 0;
      pressing.current = false;
      if (current.current) show(null);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !dragging) return;
      dragging = false;
      x = event.clientX;
      offerSoon(0);
    };
    const onSelectionChange = () => {
      if (pressing.current || unchanged()) return;
      window.clearTimeout(pending);
      if (current.current) show(null);
      // While a mouse is still selecting, its release offers the link. Otherwise the offer
      // follows the selection once it rests: a finger moves it by its handles, which the
      // page never hears about, and a mouse's last move can land after its release.
      if (pointer && !dragging) offerSoon(pointer === 'mouse' ? 0 : settleFor);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && current.current) show(null);
    };
    // Phones resize the height as their address bar slides away; only a new width moves the text.
    let width = document.documentElement.clientWidth;
    const onResize = () => {
      if (document.documentElement.clientWidth === width) return;
      width = document.documentElement.clientWidth;
      if (current.current) show(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(pending);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      show(null);
    };
  }, [bodyRef, article.html, show]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Measure the rendered offer, then place it below the selection before the first paint.
  useLayoutEffect(() => {
    if (!offer || !box.current) {
      setPlace(null);
      return;
    }
    const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
    const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
    const selected = offer.range.getBoundingClientRect();
    const x =
      offer.x === undefined
        ? selected.left + selected.width / 2
        : Math.min(Math.max(offer.x, selected.left), selected.right);
    const spot = popoverPlacement(
      { left: x, width: 0, top: selected.top, bottom: selected.bottom },
      box.current.getBoundingClientRect(),
      viewport,
      // A selection made by touch has handles below its last line.
      { header, gap: offer.x === undefined ? 30 : 10 },
    );
    setPlace({
      left: spot.left + window.scrollX,
      top: spot.top + window.scrollY,
      above: spot.above,
    });
  }, [offer, status]);

  if (!offer) return null;
  const act = async () => {
    const offered = current.current;
    pressing.current = false;
    if (!offered) return;
    const url =
      absoluteUrl(page ?? window.location.pathname + window.location.search) + offered.hash;
    if (offered.share) {
      try {
        await navigator.share({ title: article.title, text: `“${excerpt(offered.passage)}”`, url });
      } catch {
        // Closing the share sheet leaves things as they were.
      }
      if (current.current === offered) show(null);
      return;
    }
    let done: Status = 'copied';
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      done = 'failed';
    }
    if (current.current !== offered) return;
    setStatus(done);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => show(null), shownFor);
  };
  const label =
    status === 'copied'
      ? 'Link copied'
      : status === 'failed'
        ? 'Copy failed'
        : offer.share
          ? 'Share quote'
          : 'Copy link to quote';
  const style = {
    left: place?.left ?? 0,
    top: place?.top ?? 0,
    visibility: place ? undefined : 'hidden',
  } as CSSProperties;
  return createPortal(
    <div
      ref={box}
      className={`quote-link${place?.above ? ' is-above' : ''}`}
      style={style}
      aria-hidden="true"
    >
      <button
        type="button"
        tabIndex={-1}
        onPointerDown={(event) => {
          // Keeps the selection, and the focus where it was.
          event.preventDefault();
          pressing.current = true;
        }}
        onClick={act}
      >
        <Icon name={status === 'copied' ? 'check' : 'link'} />
        {label}
      </button>
    </div>,
    document.body,
  );
}
