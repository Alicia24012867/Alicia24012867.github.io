import { useEffect, useState } from 'react';
import { lockedFilePrefix } from '../../config/locked.mjs';

/**
 * The sealed photos and attachments of an open locked document, opened as the page needs
 * them. The code that opens them comes with the password form and registers here, so pages of
 * other documents never load it.
 */
type Opener = (url: string) => Promise<Blob>;

let opener: Opener | undefined;
const opened = new Map<string, Promise<string>>();
const sealedName = new RegExp(`/${lockedFilePrefix}[0-9a-f]{16}\\.[a-z0-9]+$`);

/** Whether an address names a sealed file of this site. */
export function isLockedFile(url: string) {
  try {
    const { origin, pathname } = new URL(url, location.href);
    return origin === location.origin && sealedName.test(pathname);
  } catch {
    return false;
  }
}

/** Opens sealed files with `open` until the returned function closes them all. */
export function openLockedFiles(open: Opener) {
  opener = open;
  return () => {
    if (opener === open) opener = undefined;
    for (const url of opened.values()) url.then(URL.revokeObjectURL, () => {});
    opened.clear();
  };
}

/** An address the page can show for a sealed file, opened once. */
export function lockedFileUrl(url: string) {
  const address = new URL(url, location.href).href;
  let file = opened.get(address);
  if (!file) {
    if (!opener) return Promise.reject(new Error('No locked document is open'));
    file = opener(address).then((blob) => URL.createObjectURL(blob));
    opened.set(address, file);
    file.catch(() => opened.delete(address));
  }
  return file;
}

/** The address to show for `src`: itself, or for a sealed file, its contents once opened. */
export function useShownSrc(src: string | undefined) {
  const locked = !!src && isLockedFile(src);
  const [shown, setShown] = useState<{ src: string; url: string }>();
  useEffect(() => {
    if (!src || !locked) return;
    let current = true;
    lockedFileUrl(src).then(
      (url) => current && setShown({ src, url }),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [src, locked]);
  if (!src || !locked) return src;
  return shown?.src === src ? shown.url : undefined;
}

/** Fetches a photo ahead, so that showing it later is instant. */
export function fetchAhead(src: string) {
  if (isLockedFile(src)) lockedFileUrl(src).catch(() => {});
  else new Image().src = src;
}
