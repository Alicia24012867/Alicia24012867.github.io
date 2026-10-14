/**
 * How much of the article has been read, from 0 to 1: empty until its top passes under the
 * header, full once its last line is on screen. `top` and `height` measure the article;
 * `viewTop` and `viewBottom` bound the visible page below the header.
 */
export function readingProgress(top: number, height: number, viewTop: number, viewBottom: number) {
  const distance = height - (viewBottom - viewTop);
  // An article shorter than the screen counts as read once all of it is in view.
  if (distance <= 0) return top + height <= viewBottom ? 1 : 0;
  return Math.min(1, Math.max(0, (viewTop - top) / distance));
}
