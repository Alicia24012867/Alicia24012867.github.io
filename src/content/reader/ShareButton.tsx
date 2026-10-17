import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/Icon';
import type { Article } from '../types';
import { absoluteUrl } from '../urls';
import { qrCode, qrPath } from './qr';
import { useAnchoredCard } from './useAnchoredCard';

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
  const [status, setStatus] = useState<Status>('ready');
  // How the button was last pressed; the keyboard presses no pointer.
  const pointer = useRef<string | undefined>(undefined);
  const timer = useRef(0);
  const id = useId();
  const systemShare = typeof navigator.share === 'function';
  const url = absoluteUrl(article.share?.path ?? window.location.pathname + window.location.search);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
    setStatus('ready');
  }, []);
  const { trigger, card, close, above, cardProps } = useAnchoredCard(open, dismiss);

  useEffect(() => () => window.clearTimeout(timer.current), []);

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
            className={`reader-popover share-card${above ? ' is-above' : ''}`}
            role="dialog"
            aria-label="Share"
            {...cardProps}
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
