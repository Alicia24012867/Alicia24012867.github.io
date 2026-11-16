import type { MusicMode, MusicState, Track } from './tracks';

/** The state as it is kept, the time to a tenth of a second. */
export function writtenMusic({ on, track, time, owner }: MusicState) {
  return JSON.stringify({
    on,
    track,
    time: track && time !== undefined ? Math.floor(time * 10) / 10 : undefined,
    owner,
  });
}

/** Where to go on: the kept piece at its kept time, or else piece `first` from its start. */
export function resumePoint(tracks: readonly Track[], { track, time }: MusicState, first = 0) {
  const index = track === undefined ? -1 : tracks.findIndex(({ name }) => name === track);
  return index < 0 ? { index: first, time: 0 } : { index, time: time ?? 0 };
}

/**
 * The piece to play after piece `index` of `count`: the next one round the list, the same one
 * again, or, at random, any other.
 */
export function followingPiece(
  count: number,
  index: number,
  mode: MusicMode,
  random = Math.random,
) {
  if (mode === 'one') return index;
  if (mode === 'shuffle' && count > 1) {
    const pick = Math.min(Math.floor(random() * (count - 1)), count - 2);
    return pick >= index ? pick + 1 : pick;
  }
  return (index + 1) % count;
}

/** Where to begin in a piece `duration` seconds long, or -1 when its end was reached. */
export function startAt(time: number, duration: number) {
  if (!Number.isFinite(duration)) return time;
  return time < duration - 1 ? time : -1;
}
