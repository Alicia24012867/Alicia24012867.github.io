import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/Icon';
import type { Article } from '../types';
import { absoluteUrl } from '../urls';
import { popoverPlacement } from './popover';
import { qrCode, qrPath } from './qr';

type Place = ReturnType<typeof popoverPlacement>;
type Status = 'ready' | 'copied' | 'failed';

/** How long "Link copied" stays before the button offers to copy again. */
const shownFor = 1800;

/**
 * The address as people read it: without the scheme, with its words decoded, and free to
 * wrap after each slash.
 */
function readable(url: string) {
  let short = url.replace(/^https?:\/\//, '');
  try {
    short = decodeURI(short);
  } catch {
    // Left encoded, it still reads.
  }
  return short.split('/').map((part, i) => (
    <Fragment key={i}>
      {i > 0 && (
        <>
          /<wbr />
        </>
      )}
      {part}
    </Fragment>
  ));
}

/** The address as a code that a phone's camera opens, with the light margin around it. */
function ShareCode({ url }: { url: string }) {
  const code = useMemo(() => qrCode(url), [url]);
  const path = useMemo(() => qrPath(code), [code]);
  return (
    <svg
      className="share-code"
      viewBox={`-4 -4 ${code.size + 8} ${code.size + 8}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code of the link"
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}

/**
 * Shares the open document. A tap opens the system's share sheet where there is one; a click
 * or the keyboard opens a card instead, with a code that takes the page to a phone and a
 * button that copies its link.
 */
export default function ShareButton({ article }: { article: Article }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [status, setStatus] = useState<Status>('ready');
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  // How the button was last pressed; the keyboard presses no pointer.
  const pointer = useRef<string | undefined>(undefined);
  const timer = useRef(0);
  const id = useId();
  const systemShare = typeof navigator.share === 'function';
  const url = absoluteUrl(article.share?.path ?? window.location.pathname + window.location.search);

  const close = useCallback((refocus = false) => {
    if (refocus) trigger.current?.focus();
    window.clearTimeout(timer.current);
    setOpen(false);
    setStatus('ready');
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

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

  // Measure the rendered card, then place it below the button before the first paint.
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
    if (placed) card.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [placed]);

  const share = async () => {
    try {
      await navigator.share({ title: article.title, url });
      return true;
    } catch {
      // Closing the share sheet leaves things as they were.
      return false;
    }
  };
  const press = () => {
    const by = pointer.current;
    pointer.current = undefined;
    if (open) close();
    else if (systemShare && by !== undefined && by !== 'mouse') void share();
    else setOpen(true);
  };
  const copy = async () => {
    let done: Status = 'copied';
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      done = 'failed';
    }
    setStatus(done);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus('ready'), shownFor);
  };
  // The card sits at the end of the page: leaving it goes on from the button instead.
  const onCardKeyDown = (event: KeyboardEvent) => {
    const buttons = card.current?.querySelectorAll('button');
    if (event.key !== 'Tab' || !buttons?.length) return;
    if (event.target !== (event.shiftKey ? buttons[0] : buttons[buttons.length - 1])) return;
    if (event.shiftKey) event.preventDefault();
    close(true);
  };

  const style = {
    left: place?.left ?? 0,
    top: place?.top ?? 0,
    visibility: place ? undefined : 'hidden',
    '--caret': `${place?.caret ?? 0}px`,
  } as CSSProperties;
  return (
    <span className="article-share">
      <button
        ref={trigger}
        type="button"
        className={open ? 'is-active' : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onPointerDown={(event) => (pointer.current = event.pointerType)}
        onClick={press}
      >
        <Icon name="share" />
        Share
      </button>
      {open &&
        createPortal(
          <div
            ref={card}
            id={id}
            className={`reader-popover share-card${place?.above ? ' is-above' : ''}`}
            style={style}
            role="dialog"
            aria-label="Share"
            onKeyDown={onCardKeyDown}
            onBlur={(event) => {
              // Focus taken elsewhere in the page closes it; the window losing focus does not.
              const next = event.relatedTarget;
              if (next && !event.currentTarget.contains(next) && next !== trigger.current) close();
            }}
          >
            <p className="share-card-label">Scan to read on your phone</p>
            <ShareCode url={url} />
            <p className="share-card-url">{readable(url)}</p>
            <div className="share-card-actions">
              <button type="button" onClick={copy}>
                <Icon name={status === 'copied' ? 'check' : 'link'} />
                {status === 'copied'
                  ? 'Link copied'
                  : status === 'failed'
                    ? 'Copy failed'
                    : 'Copy link'}
              </button>
              {systemShare && (
                <button
                  type="button"
                  onClick={async () => {
                    if (await share()) close(true);
                  }}
                >
                  <Icon name="share" />
                  Other apps
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
