/** A link that opens an image file is a "view at full size" link. */
export function isImageFile(url: string) {
  try {
    return /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(
      new URL(url, 'https://site.invalid').pathname,
    );
  } catch {
    return false;
  }
}

/** A horizontal touch swipe steps through the photos: -1 back, 1 forward, 0 neither. */
export function swipeStep(dx: number, dy: number) {
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

/** Stepping past either end wraps around. */
export const wrapIndex = (index: number, count: number) => ((index % count) + count) % count;
