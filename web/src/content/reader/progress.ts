import { finishedAt, startedAt } from './resume.ts';

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

/** Whether a text estimated at `minutes` is long enough to count down; a short read is not. */
export const countsDown = (minutes: number) => minutes >= 3;

/**
 * Whole minutes of reading left in a text estimated at `minutes` in all, once `progress` of
 * it is read. None for a short text, before reading has begun or once it is all but done,
 * where Continue reading also stops keeping the place.
 */
export function minutesLeft(minutes: number, progress: number) {
  if (!countsDown(minutes) || progress < startedAt || progress >= finishedAt) return undefined;
  return Math.max(1, Math.ceil(minutes * (1 - progress)));
}
