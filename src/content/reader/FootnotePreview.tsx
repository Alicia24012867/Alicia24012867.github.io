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
import { footnotePlacement } from './footnotes';

type Preview = {
  reference: HTMLAnchorElement;
  number: string;
  html: string;
  pinned: boolean;
};
type Place = ReturnType<typeof footnotePlacement>;

const referenceOf = (target: EventTarget | null) =>
  target instanceof Element ? target.closest<HTMLAnchorElement>('.footnote-ref a') : null;

/** The footnote a reference points to, without its back links or ids it would repeat. */
function footnoteFor(root: HTMLElement, reference: HTMLAnchorElement) {
  let id: string;
  try {
    id = decodeURIComponent(reference.hash.slice(1));
  } catch {
    return null;
  }
  const item = document.getElementById(id);
  const content = item && root.contains(item) && item.querySelector('.footnote-content');
  if (!content) return null;
  const copy = content.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.footnote-back').forEach((link) => link.closest('p')?.remove());
  copy.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  copy
    .querySelectorAll('[aria-describedby]')
    .forEach((element) => element.removeAttribute('aria-describedby'));
  // Screen readers already hear the note through the reference's aria-describedby.
  copy
    .querySelectorAll('a, button, input')
    .forEach((element) => element.setAttribute('tabindex', '-1'));
  return copy.innerHTML;
}

/**
 * Shows a footnote beside its reference: on hover, on keyboard focus, or on a tap, which
 * no longer jumps away from the text. Tapping the same reference again goes to the note.
 */
export default function FootnotePreview({
  bodyRef,
  slug,
}: {
  bodyRef: RefObject<HTMLElement | null>;
  slug: string;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const current = useRef<Preview | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timers = useRef({ open: 0, close: 0 });

  const update = useCallback((next: Preview | null) => {
    window.clearTimeout(timers.current.open);
    window.clearTimeout(timers.current.close);
    current.current = next;
    setPreview(next);
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
    if (!root?.querySelector('.footnote-ref a')) return;
    let touched: HTMLAnchorElement | null = null;
    const show = (reference: HTMLAnchorElement, pinned: boolean) => {
      const html = footnoteFor(root, reference);
      if (html) update({ reference, number: reference.textContent?.trim() ?? '', html, pinned });
    };
    const onPointerOver = (event: PointerEvent) => {
      const reference = referenceOf(event.target);
      if (event.pointerType !== 'mouse' || !reference) return;
      if (current.current?.reference === reference) return stay();
      window.clearTimeout(timers.current.open);
      timers.current.open = window.setTimeout(() => show(reference, false), 120);
    };
    const onPointerOut = (event: PointerEvent) => {
      const reference = referenceOf(event.target);
      if (event.pointerType !== 'mouse' || !reference) return;
      if (event.relatedTarget instanceof Node && reference.contains(event.relatedTarget)) return;
      hideSoon();
    };
    const onPointerDown = (event: PointerEvent) => {
      touched = event.pointerType === 'mouse' ? null : referenceOf(event.target);
    };
    const onClick = (event: MouseEvent) => {
      const reference = referenceOf(event.target);
      if (!reference || reference !== touched) return;
      touched = null;
      if (current.current?.reference === reference && current.current.pinned) return hide();
      event.preventDefault();
      show(reference, true);
    };
    const onFocusIn = (event: FocusEvent) => {
      const reference = referenceOf(event.target);
      if (reference?.matches(':focus-visible')) show(reference, false);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (referenceOf(event.target)) hideSoon();
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
  }, [bodyRef, slug, update, hide, hideSoon, stay]);

  useEffect(() => {
    if (!preview) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (box.current?.contains(target) || referenceOf(event.target)) return;
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
  }, [preview, hide]);

  // Measure the rendered preview, then place it before the first paint.
  useLayoutEffect(() => {
    if (!preview || !box.current) {
      setPlace(null);
      return;
    }
    const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
    const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
    const spot = footnotePlacement(
      preview.reference.getBoundingClientRect(),
      box.current.getBoundingClientRect(),
      viewport,
      { header },
    );
    setPlace({ ...spot, left: spot.left + window.scrollX, top: spot.top + window.scrollY });
  }, [preview]);

  if (!preview) return null;
  const style = {
    left: place?.left ?? 0,
    top: place?.top ?? 0,
    visibility: place ? undefined : 'hidden',
    '--caret': `${place?.caret ?? 0}px`,
  } as CSSProperties;
  return createPortal(
    <div
      ref={box}
      className={`footnote-preview${place?.above ? ' is-above' : ''}`}
      style={style}
      aria-hidden="true"
      onPointerEnter={(event) => event.pointerType === 'mouse' && stay()}
      onPointerLeave={(event) => event.pointerType === 'mouse' && hideSoon()}
    >
      <p className="footnote-preview-label">Footnote {preview.number}</p>
      <div
        className="footnote-preview-body article-body"
        dangerouslySetInnerHTML={{ __html: preview.html }}
      />
      <a
        className="footnote-preview-jump"
        href={preview.reference.getAttribute('href') ?? undefined}
        tabIndex={-1}
        onClick={hide}
      >
        Go to footnote ↓
      </a>
    </div>,
    document.body,
  );
}
