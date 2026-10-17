import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { popoverPlacement } from './popover';

type Place = ReturnType<typeof popoverPlacement>;

/** Where the keyboard stops in a card, in order: each control, and each radio group once. */
const stops = (card: HTMLElement) =>
  [...card.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')].filter(
    (control) =>
      !(control instanceof HTMLInputElement && control.type === 'radio' && !control.checked),
  );

/**
 * A card opened from a button in a document's details: placed below the button, or above it
 * short of room, and drawn at the end of the page. A press elsewhere, Escape, focus moving away
 * or a new width closes it. The keyboard goes into the card as it opens, and leaving it goes on
 * from the button. `onClose` must keep its identity between renders.
 */
export function useAnchoredCard(open: boolean, onClose: () => void) {
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);

  const close = useCallback(
    (refocus = false) => {
      if (refocus) trigger.current?.focus();
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!card.current?.contains(target) && !trigger.current?.contains(target)) close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close(card.current?.contains(document.activeElement));
    };
    // Phones resize the height as their address bar slides away; only a new width moves the text.
    const width = document.documentElement.clientWidth;
    const onResize = () => {
      if (document.documentElement.clientWidth !== width) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  // Measure the rendered card, then place it by the button before the first paint.
  useLayoutEffect(() => {
    if (!open || !card.current || !trigger.current) {
      setPlace(null);
      return;
    }
    const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
    const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
    const spot = popoverPlacement(
      trigger.current.getBoundingClientRect(),
      card.current.getBoundingClientRect(),
      viewport,
      { header },
    );
    setPlace({ ...spot, left: spot.left + window.scrollX, top: spot.top + window.scrollY });
  }, [open]);

  // Once the card shows, the keyboard carries on inside it.
  const placed = !!place;
  useEffect(() => {
    if (placed && card.current) stops(card.current)[0]?.focus({ preventScroll: true });
  }, [placed]);

  // The card sits at the end of the page: leaving it goes on from the button instead.
  const onKeyDown = (event: KeyboardEvent) => {
    const all = card.current ? stops(card.current) : [];
    if (event.key !== 'Tab' || !all.length) return;
    if (event.target !== (event.shiftKey ? all[0] : all[all.length - 1])) return;
    if (event.shiftKey) event.preventDefault();
    close(true);
  };
  // Focus taken elsewhere in the page closes it; the window losing focus does not.
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next && !event.currentTarget.contains(next) && next !== trigger.current) close();
  };

  const style = {
    left: place?.left ?? 0,
    top: place?.top ?? 0,
    visibility: place ? undefined : 'hidden',
    '--caret': `${place?.caret ?? 0}px`,
  } as CSSProperties;
  return { trigger, card, close, above: !!place?.above, cardProps: { style, onKeyDown, onBlur } };
}
