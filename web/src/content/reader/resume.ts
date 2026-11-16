/** Where a reader stopped in one document. It stays in this browser and is never sent anywhere. */
export interface Bookmark {
  /** The article block under the header, and how far down it the header's edge was (0–1). */
  block: number;
  offset: number;
  /** How many blocks the article had; another count means it was edited since. */
  blocks: number;
  /** Reading progress from 0 to 1, as the line under the header shows it. */
  progress: number;
  /** The section heading above that spot, if the reader was past the first one. */
  heading?: string;
  /** When it was saved, in milliseconds since the epoch. */
  at: number;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Box = { top: number; height: number };

export const bookmarksKey = 'alicia-reading-places';
/** Places are kept for the most recently read documents only. */
export const bookmarkLimit = 20;
/** Below this much progress there is nothing to come back to; from `finishedAt` it is read. */
export const startedAt = 0.05;
export const finishedAt = 0.95;

const share = (value: unknown) => typeof value === 'number' && value >= 0 && value <= 1;
const count = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;

function isBookmark(value: unknown): value is Bookmark {
  if (!value || typeof value !== 'object') return false;
  const { block, offset, blocks, progress, heading, at } = value as Record<string, unknown>;
  return (
    count(block) &&
    count(blocks) &&
    (block as number) < (blocks as number) &&
    share(offset) &&
    share(progress) &&
    (heading === undefined || typeof heading === 'string') &&
    Number.isFinite(at)
  );
}

/** Saved places by page address; anything unreadable counts as none. */
export function readBookmarks(store: Store | undefined): Record<string, Bookmark> {
  try {
    const saved: unknown = JSON.parse(store?.getItem(bookmarksKey) ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([, place]) => isBookmark(place)));
  } catch {
    return {};
  }
}

/** Saves a page's place, or forgets it without one, keeping the most recent `limit` pages. */
export function writeBookmark(
  store: Store | undefined,
  page: string,
  bookmark: Bookmark | undefined,
  limit = bookmarkLimit,
) {
  const places = readBookmarks(store);
  if (!bookmark && !(page in places)) return;
  if (bookmark) places[page] = bookmark;
  else delete places[page];
  const kept = Object.entries(places)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, limit);
  try {
    if (kept.length) store?.setItem(bookmarksKey, JSON.stringify(Object.fromEntries(kept)));
    else store?.removeItem(bookmarksKey);
  } catch {
    // Full or blocked storage: reading works the same, only the place is not kept.
  }
}

/** The block under `line` (the header's lower edge) and how far down it the line falls. */
export function placeAt(blocks: readonly Box[], line: number) {
  if (!blocks.length) return undefined;
  const found = blocks.findIndex(({ top, height }) => top + height > line);
  const block = found === -1 ? blocks.length - 1 : found;
  const { top, height } = blocks[block];
  const offset = height > 0 ? Math.min(1, Math.max(0, (line - top) / height)) : 0;
  return { block, offset };
}

/** The last heading at or above `threshold`; none while the reader is before the first. */
export function sectionAt(headings: readonly { id: string; top: number }[], threshold: number) {
  let section: string | undefined;
  for (const heading of headings) {
    if (heading.top > threshold) break;
    section = heading.id;
  }
  return section;
}

/**
 * How far to scroll so the saved spot is back under the header: the same block when the
 * article is unchanged, otherwise the same reading progress. `article` measures the article
 * now; `viewTop` and `viewBottom` bound the visible page below the header.
 */
export function scrollToPlace(
  bookmark: Bookmark,
  blocks: readonly Box[],
  article: Box,
  viewTop: number,
  viewBottom: number,
) {
  const box = blocks.length === bookmark.blocks ? blocks[bookmark.block] : undefined;
  if (box) return box.top + bookmark.offset * box.height - viewTop;
  const distance = article.height - (viewBottom - viewTop);
  return distance > 0 ? article.top - viewTop + bookmark.progress * distance : 0;
}
