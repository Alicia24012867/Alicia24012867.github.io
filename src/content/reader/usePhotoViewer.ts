import { useCallback, useEffect, useState, type RefObject } from 'react';
import { isImageFile } from './photos';

type Photo = { src: string; alt: string; caption: string; opener: HTMLElement };
type PhotoView = { photos: Photo[]; index: number };

/**
 * Article images in reading order: images wrapped in a link to their full-size file,
 * and images without a link, which open their full-size file when the page shows a
 * smaller copy. Images that link elsewhere keep their link.
 */
function photosIn(root: HTMLElement) {
  const photos: Photo[] = [];
  for (const image of root.querySelectorAll('img')) {
    const link = image.closest('a');
    if (link && !isImageFile(link.href)) continue;
    photos.push({
      src: link?.href || image.dataset.fullSrc || image.currentSrc || image.src,
      alt: image.alt,
      caption: image.closest('figure')?.querySelector('figcaption')?.textContent?.trim() ?? '',
      opener: link ?? image,
    });
  }
  return photos;
}

/** Opens article photos in the viewer instead of leaving the page for the bare file. */
export function usePhotoViewer(bodyRef: RefObject<HTMLElement | null>, slug: string) {
  const [view, setView] = useState<PhotoView | null>(null);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    for (const { opener } of photosIn(root)) {
      opener.dataset.photo = '';
      if (!(opener instanceof HTMLImageElement)) continue;
      // Images without a link become buttons, so the keyboard can open them too.
      opener.tabIndex = 0;
      opener.setAttribute('role', 'button');
      opener.setAttribute('aria-label', `View image at full size: ${opener.alt || 'image'}`);
    }
    const openFrom = (event: Event, target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      const opener = target.closest('a') ?? target.closest('img');
      if (!opener || !root.contains(opener)) return;
      const photos = photosIn(root);
      const index = photos.findIndex((photo) => photo.opener === opener);
      if (index < 0) return;
      event.preventDefault();
      setView({ photos, index });
    };
    const onClick = (event: MouseEvent) => {
      // Modified clicks still open the file in a new tab or window.
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      openFrom(event, event.target);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLImageElement)
        openFrom(event, event.target);
    };
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeyDown);
    };
  }, [bodyRef, slug]);

  const close = useCallback(() => setView(null), []);
  const show = useCallback((index: number) => setView((view) => view && { ...view, index }), []);
  return { view, show, close };
}
