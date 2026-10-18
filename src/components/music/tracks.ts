/** A piece of music from `public/audio/`, in each format it comes in, the preferred first. */
export interface Track {
  name: string;
  sources: { src: string; type: string }[];
}

/**
 * What this browser keeps about the background music: whether it is on, which piece it got to
 * and how far. The page playing it names itself as `owner`, so that the others stop.
 */
export interface MusicState {
  on: boolean;
  track?: string;
  /** Seconds into the piece. */
  time?: number;
  owner?: string;
}

export const musicKey = 'alicia-music';

/** The pieces this browser can play, each in only the formats it can play. */
export function playableTracks(tracks: readonly Track[], canPlay: (type: string) => boolean) {
  return tracks
    .map((track) => ({ ...track, sources: track.sources.filter(({ type }) => canPlay(type)) }))
    .filter((track) => track.sources.length);
}

/** A piece's name as the reader sees it, without the number that sets its place in the list. */
export const pieceTitle = (name: string) => name.replace(/^\d+\s*[.)_-]?\s+(?=\S)/, '');

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/** The kept state; anything missing or broken counts as off, from the beginning. */
export function readMusic(saved: string | null): MusicState {
  let kept: unknown;
  try {
    kept = JSON.parse(saved ?? 'null');
  } catch {
    kept = null;
  }
  if (!kept || typeof kept !== 'object' || Array.isArray(kept)) return { on: false };
  const { on, track, time, owner } = kept as Record<string, unknown>;
  const state: MusicState = { on: on === true };
  if (text(track)) {
    state.track = text(track);
    if (typeof time === 'number' && time >= 0 && Number.isFinite(time)) state.time = time;
  }
  if (text(owner)) state.owner = text(owner);
  return state;
}
