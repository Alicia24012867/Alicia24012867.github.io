import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { nearestBox, popoverPlacement } from './popover';

type Point = { x: number; y: number };
type Opened = { link: HTMLAnchorElement; card: ReactNode; pinned: boolean; point?: Point };
type Place = ReturnType<typeof popoverPlacement>;

/**
 * A card beside an article link, opened by hovering or keyboard focus. With `tapToOpen`, a
 * tap opens it instead of following the link, and tapping the same link again follows it.
 * `render` returns the card for a link, or null to leave that link alone. The card is a
 * visual aid, hidden from screen readers, so its links are kept out of the tab order.
 */
export default function ReaderPopover({
  bodyRef,
  slug,
  selector,
  render,
  className,
  delay = 120,
  tapToOpen = false,
}: {
  bodyRef: RefObject<HTMLElement | null>;
  slug: string;
  selector: string;
  render: (link: HTMLAnchorElement, close: () => void) => ReactNode | null;
  className: string;
  delay?: number;
  tapToOpen?: boolean;
}) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const current = useRef<Opened | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timers = useRef({ open: 0, close: 0 });

  const linkOf = useCallback(
    (target: EventTarget | null) => {
      const link = target instanceof Element ? target.closest<HTMLAnchorElement>(selector) : null;
      return link && bodyRef.current?.contains(link) ? link : null;
    },
    [bodyRef, selector],
  );
  const update = useCallback((next: Opened | null) => {
    window.clearTimeout(timers.current.open);
    window.clearTimeout(timers.current.close);
    current.current = next;
    setOpened(next);
  }, []);
  const hide = useCallback(() => update(null), [update]);
  const hideSoon = useCallback(() => {
    window.clearTimeout(timers.current.open);
    window.clearTimeout(timers.current.close);
    if (!current.current?.pinned) timers.current.close = window.setTimeout(hide, 200);
  }, [hide]);
  const stay = useCallback(() => window.clearTimeout(timers.current.close), []);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root?.querySelector(selector)) return;
    let touched: HTMLAnchorElement | null = null;
    const show = (link: HTMLAnchorElement, pinned: boolean, point?: Point) => {
      const card = render(link, hide);
      if (card) update({ link, card, pinned, point });
    };
    const onPointerOver = (event: PointerEvent) => {
      const link = linkOf(event.target);
      if (event.pointerType !== 'mouse' || !link) return;
      if (current.current?.link === link) return stay();
      window.clearTimeout(timers.current.open);
      const point = { x: event.clientX, y: event.clientY };
      timers.current.open = window.setTimeout(() => show(link, false, point), delay);
    };
    const onPointerOut = (event: PointerEvent) => {
      const link = linkOf(event.target);
      if (event.pointerType !== 'mouse' || !link) return;
      if (event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) return;
      hideSoon();
    };
    const onPointerDown = (event: PointerEvent) => {
      touched = event.pointerType === 'mouse' ? null : linkOf(event.target);
    };
    const onClick = (event: MouseEvent) => {
      const link = linkOf(event.target);
      if (!tapToOpen || !link || link !== touched) return;
      touched = null;
      if (current.current?.link === link && current.current.pinned) return hide();
      if (!render(link, hide)) return;
      event.preventDefault();
      show(link, true, { x: event.clientX, y: event.clientY });
    };
    const onFocusIn = (event: FocusEvent) => {
      const link = linkOf(event.target);
      if (link?.matches(':focus-visible')) show(link, false);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (linkOf(event.target)) hideSoon();
    };
    root.addEventListener('pointerover', onPointerOver);
    root.addEventListener('pointerout', onPointerOut);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('click', onClick);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    return () => {
      root.removeEventListener('pointerover', onPointerOver);
      root.removeEventListener('pointerout', onPointerOut);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('click', onClick);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      update(null);
    };
  }, [bodyRef, slug, selector, render, delay, tapToOpen, linkOf, update, hide, hideSoon, stay]);

  useEffect(() => {
    if (!opened) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (box.current?.contains(target) || linkOf(event.target)) return;
      hide();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    // Phones resize the height as their address bar slides away; only a new width moves the text.
    const width = document.documentElement.clientWidth;
    const onResize = () => {
      if (document.documentElement.clientWidth !== width) hide();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    window.addEventListener('hashchange', hide);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('hashchange', hide);
    };
  }, [opened, linkOf, hide]);

  // Measure the rendered card, then place it before the first paint.
  useLayoutEffect(() => {
    if (!opened || !box.current) {
      setPlace(null);
      return;
    }
    const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
    const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
    // A link that wraps has a box per line: point at the one under the pointer.
    const line = nearestBox([...opened.link.getClientRects()], opened.point);
    const spot = popoverPlacement(
      line ?? opened.link.getBoundingClientRect(),
      box.current.getBoundingClientRect(),
      viewport,
      { header },
    );
    setPlace({ ...spot, left: spot.left + window.scrollX, top: spot.top + window.scrollY });
  }, [opened]);

  if (!opened) return null;
  const style = {
    left: place?.left ?? 0,
    top: place?.top ?? 0,
    visibility: place ? undefined : 'hidden',
    '--caret': `${place?.caret ?? 0}px`,
  } as CSSProperties;
  return createPortal(
    <div
      ref={box}
      className={`reader-popover ${className}${place?.above ? ' is-above' : ''}`}
      style={style}
      aria-hidden="true"
      onPointerEnter={(event) => event.pointerType === 'mouse' && stay()}
      onPointerLeave={(event) => event.pointerType === 'mouse' && hideSoon()}
    >
      {opened.card}
    </div>,
    document.body,
  );
}
