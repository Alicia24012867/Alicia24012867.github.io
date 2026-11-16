import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import Icon from '../../components/Icon';
import { fetchAhead, useShownSrc } from '../locked/files';
import { swipeStep, wrapIndex } from './photos';
import { usePhotoViewer } from './usePhotoViewer';

/** An article photo shown large over the page, with its caption and the article's other photos. */
export default function PhotoViewer({
  bodyRef,
  slug,
}: {
  bodyRef: RefObject<HTMLElement | null>;
  slug: string;
}) {
  const { view, show, close } = usePhotoViewer(bodyRef, slug);
  const ref = useRef<HTMLDialogElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swipedAt = useRef(-Infinity);
  const opener = useRef<HTMLElement | null>(null);
  const open = view !== null;
  const count = view?.photos.length ?? 0;
  const photo = view?.photos[view.index];
  // A locked document's photo shows once its sealed file is open.
  const shown = useShownSrc(photo?.src);

  useEffect(() => {
    if (photo) opener.current = photo.opener;
  }, [photo]);

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    dialog.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = oldOverflow;
      // Focus returns to the photo shown last; the page scrolls only if it is off screen.
      const photo = opener.current;
      if (!photo) return;
      const { top, bottom } = photo.getBoundingClientRect();
      photo.focus({ preventScroll: top < innerHeight && bottom > 0 });
    };
  }, [open]);

  // The neighbours are fetched ahead, so stepping through feels instant.
  useEffect(() => {
    if (!view || count < 2) return;
    for (const by of [1, -1]) fetchAhead(view.photos[wrapIndex(view.index + by, count)].src);
  }, [view, count]);

  const step = (by: number) => {
    if (view && count > 1 && by) show(wrapIndex(view.index + by, count));
  };
  const startSwipe = (event: PointerEvent) => {
    swipe.current = event.pointerType === 'mouse' ? null : { x: event.clientX, y: event.clientY };
  };
  const endSwipe = (event: PointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    const by = start ? swipeStep(event.clientX - start.x, event.clientY - start.y) : 0;
    if (!by) return;
    swipedAt.current = event.timeStamp;
    step(by);
  };

  return (
    <dialog
      ref={ref}
      className="photo-viewer"
      aria-label={count > 1 && view ? `Photo ${view.index + 1} of ${count}` : 'Photo'}
      onClose={close}
      onClick={(event) => {
        // The dark surround closes the viewer, unless the touch was a swipe.
        const surround =
          event.target === event.currentTarget || event.target === event.currentTarget.firstChild;
        if (surround && event.timeStamp - swipedAt.current > 500) close();
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') step(-1);
        else if (event.key === 'ArrowRight') step(1);
      }}
    >
      {view && photo && (
        <div
          className="photo-stage"
          onPointerDown={startSwipe}
          onPointerUp={endSwipe}
          onPointerCancel={() => (swipe.current = null)}
        >
          <button className="icon-button photo-close" aria-label="Close photo" onClick={close}>
            <Icon name="close" />
          </button>
          <figure>
            <img key={photo.src} src={shown} alt={photo.alt} decoding="async" />
            {(photo.caption || count > 1) && (
              <figcaption>
                {photo.caption && <span>{photo.caption}</span>}
                {count > 1 && (
                  <span className="photo-count">
                    {view.index + 1} / {count}
                  </span>
                )}
              </figcaption>
            )}
          </figure>
          {count > 1 && (
            <>
              <button
                className="icon-button photo-step photo-previous"
                aria-label="Previous photo"
                onClick={() => step(-1)}
              >
                <Icon name="arrow" />
              </button>
              <button
                className="icon-button photo-step photo-next"
                aria-label="Next photo"
                onClick={() => step(1)}
              >
                <Icon name="arrow" />
              </button>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
