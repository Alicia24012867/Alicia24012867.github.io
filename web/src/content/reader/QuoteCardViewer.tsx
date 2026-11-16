import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import { drawQuoteCard, type QuoteCardText } from './quoteCard';

type Picture = { blob: Blob; url: string; file: File };
type Status = 'ready' | 'copied' | 'failed';

/** How long "Image copied" stays before the button offers to copy again. */
const shownFor = 1800;

const fontStack = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'sans-serif';

/**
 * The selected passage drawn as a picture, shown over the page to save, copy or share.
 * Escape, the close button or a click beside the picture closes it.
 */
export default function QuoteCardViewer({
  card,
  filename,
  onClose,
}: {
  card: QuoteCardText;
  filename: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [picture, setPicture] = useState<Picture | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<Status>('ready');
  // The sky starts as the page's theme has it, and the other can be chosen.
  const [night, setNight] = useState(() => document.documentElement.dataset.theme === 'night');
  const timer = useRef(0);
  // The picture on screen, let go once another replaces it.
  const shown = useRef('');
  const name = night ? filename.replace(/\.png$/, '-night.png') : filename;
  const skyLabel = night ? 'Switch to day sky' : 'Switch to night sky';

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(timer.current);
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    let current = true;
    const fonts = { body: fontStack('--font-body'), display: fontStack('--font-display') };
    // The picture already shown stays until the next one is drawn.
    drawQuoteCard(card, fonts, { night })
      .then((blob) => {
        if (!current) return;
        const url = URL.createObjectURL(blob);
        if (shown.current) URL.revokeObjectURL(shown.current);
        shown.current = url;
        setPicture({ blob, url, file: new File([blob], name, { type: 'image/png' }) });
        setFailed(false);
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [card, name, night]);

  useEffect(
    () => () => {
      if (shown.current) URL.revokeObjectURL(shown.current);
    },
    [],
  );

  const canCopy = typeof ClipboardItem === 'function' && !!navigator.clipboard?.write;
  const canShare =
    !!picture &&
    typeof navigator.share === 'function' &&
    !!navigator.canShare?.({ files: [picture.file] });
  const copy = async () => {
    if (!picture) return;
    let done: Status = 'copied';
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': picture.blob })]);
    } catch {
      done = 'failed';
    }
    setStatus(done);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus('ready'), shownFor);
  };
  const share = async () => {
    if (!picture) return;
    try {
      await navigator.share({ files: [picture.file], title: card.title });
    } catch {
      // Closing the share sheet leaves the picture where it was.
    }
  };

  return (
    <dialog
      ref={ref}
      className="quote-card"
      aria-label="Quote as a picture"
      onClose={(event) => {
        // Mounting twice in development closes and reopens it; that close is not the reader's.
        if (!event.currentTarget.open) onClose();
      }}
      onClick={(event) => {
        // Around the picture and its buttons is the dark surround, which closes it.
        if (event.target === event.currentTarget || event.target === event.currentTarget.firstChild)
          onClose();
      }}
    >
      <div className="quote-card-stage">
        <button className="icon-button quote-card-close" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
        <button
          className="icon-button quote-card-sky"
          aria-label={skyLabel}
          title={skyLabel}
          onClick={() => setNight((value) => !value)}
        >
          <Icon name={night ? 'moon' : 'sun'} />
        </button>
        {picture ? (
          <img
            className="quote-card-picture"
            src={picture.url}
            alt={`“${card.passage}” — ${card.title}`}
          />
        ) : (
          <div className="quote-card-picture quote-card-pending" role="status">
            {failed ? 'Couldn’t draw the picture' : 'Drawing the picture…'}
          </div>
        )}
        <div className="quote-card-actions">
          {canShare && (
            <button type="button" className="button button-primary" onClick={share}>
              <Icon name="share" />
              Share
            </button>
          )}
          <a
            className={`button ${canShare ? 'quote-card-secondary' : 'button-primary'}`}
            href={picture?.url}
            download={picture?.file.name}
            aria-disabled={!picture}
            onClick={(event) => !picture && event.preventDefault()}
          >
            <Icon name="down" />
            Save image
          </a>
          {canCopy && (
            <button
              type="button"
              className="button quote-card-secondary"
              disabled={!picture}
              onClick={copy}
            >
              <Icon name={status === 'copied' ? 'check' : 'copy'} />
              {status === 'copied'
                ? 'Image copied'
                : status === 'failed'
                  ? 'Copy failed'
                  : 'Copy image'}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
