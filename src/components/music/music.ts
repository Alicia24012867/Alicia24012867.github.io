import tracks from 'virtual:music';
import { resumePoint, writtenMusic } from './place';
import {
  musicKey,
  musicModeKey,
  playableTracks,
  readMode,
  readMusic,
  type MusicMode,
  type MusicState,
} from './tracks';

/**
 * `playing` once the reader turned the music on here; `paused` while it is on but waits, for a
 * press where the browser lets only a press start sound, or for reading aloud to end.
 */
export type MusicStatus = 'off' | 'playing' | 'paused';

/**
 * The player itself, in its own file: loaded at the first sign of a press, or at once when the
 * music was left on.
 */
export interface Player {
  play(): void;
  stop(): void;
  /** Rests the music while the page reads aloud (`true`), and brings it back after. */
  hold(on: boolean): void;
  /** Goes to the next piece (`1`) or the one before (`-1`), as the order has them. */
  skip(step: number): void;
  /** Plays piece `index` of the list from its start. */
  choose(index: number): void;
  /** Moves to `time` seconds into the piece. */
  seek(time: number): void;
  /** Readies the piece shown in the panel, so that its length is known before it plays. */
  peek(): void;
}

/** The piece in the panel and how far into it the music is; `duration` is NaN until known. */
export interface MusicPlace {
  index: number;
  time: number;
  duration: number;
}

/** What a press began before the player arrived; see `prepare`. */
export interface Prepared {
  audio: HTMLAudioElement;
  context?: AudioContext;
}

const probe = tracks.length ? document.createElement('audio') : undefined;
/** The pieces this browser can play. Without any, there is no music button. */
export const playable = probe ? playableTracks(tracks, (type) => !!probe.canPlayType(type)) : [];

/**
 * iPhones and iPads leave the loudness of a page's sound to the buttons on their side. There the
 * music goes through the browser's audio graph, the one way a page can play it softly.
 */
export const fixedVolume =
  /^iP(hone|ad|od)/.test(navigator.platform) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** The kept state; without storage, the music starts off on every page. */
export function keptMusic(): MusicState {
  try {
    return readMusic(localStorage.getItem(musicKey));
  } catch {
    return { on: false };
  }
}

/**
 * Where the music goes on: the kept piece at its kept place. With none kept yet, the first piece
 * is picked at random, and kept at once so that every page begins with the same one.
 */
export function startingPoint() {
  const state = keptMusic();
  const point = resumePoint(playable, state, Math.floor(Math.random() * playable.length));
  const track = playable[point.index]?.name;
  if (track && track !== state.track)
    try {
      localStorage.setItem(musicKey, writtenMusic({ ...state, track, time: 0 }));
    } catch {
      // Without storage, each page picks its own.
    }
  return point;
}

let status: MusicStatus = playable.length && keptMusic().on ? 'paused' : 'off';
const listeners = new Set<() => void>();
let player: Player | undefined;
let loading: Promise<Player> | undefined;
let prepared: Prepared | undefined;
let held = false;
// What the last press asked for while the player was still on its way.
let pressed = false;

// Chrome remembers a failed load until the page reloads, so none is tried without a connection.
function load() {
  if (!navigator.onLine) return Promise.reject(new Error('The music needs a connection'));
  loading ??= import('./MusicPlayer').then(
    ({ createPlayer }) => (player = createPlayer(prepared)),
    (error) => {
      loading = undefined;
      throw error;
    },
  );
  return loading;
}

/**
 * Safari lets a page begin sound only inside a press. Before the player arrives, the press
 * begins what it will play with: an element, which may then play at any time, and on iPhones
 * and iPads the audio graph's context, which keeps the music soft.
 */
function prepare(): Prepared {
  const audio = new Audio();
  audio.load();
  const context = fixedVolume ? new AudioContext() : undefined;
  context?.resume().catch(() => {});
  return { audio, context };
}

function storedMode() {
  try {
    return readMode(localStorage.getItem(musicModeKey));
  } catch {
    return 'all';
  }
}
let mode: MusicMode = storedMode();
const modeWatchers = new Set<() => void>();

/** The order the pieces play in, kept in this browser and followed by every page. */
export const musicMode = {
  subscribe(watcher: () => void) {
    modeWatchers.add(watcher);
    return () => {
      modeWatchers.delete(watcher);
    };
  },
  get: () => mode,
  set(next: MusicMode) {
    mode = next;
    try {
      if (next === 'all') localStorage.removeItem(musicModeKey);
      else localStorage.setItem(musicModeKey, next);
    } catch {
      // Without storage, the order lasts as long as the page.
    }
    modeWatchers.forEach((watcher) => watcher());
  },
};
window.addEventListener('storage', (event) => {
  if (event.key !== musicModeKey && event.key !== null) return;
  mode = storedMode();
  modeWatchers.forEach((watcher) => watcher());
});

let place: MusicPlace | undefined;
const watchers = new Set<() => void>();

/** For the panel: the piece and the time in it, told by the player as the music goes on. */
export const musicPlace = {
  subscribe(watcher: () => void) {
    watchers.add(watcher);
    return () => {
      watchers.delete(watcher);
    };
  },
  get: () => (place ??= { ...startingPoint(), duration: NaN }),
  /** For the player. */
  tell(next: MusicPlace) {
    const now = musicPlace.get();
    const same =
      now.index === next.index && now.time === next.time && Object.is(now.duration, next.duration);
    if (same) return;
    place = next;
    watchers.forEach((watcher) => watcher());
  },
};

export const music = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => status,
  /** For the player: what the button shows. */
  show(next: MusicStatus) {
    if (next === status) return;
    status = next;
    listeners.forEach((listener) => listener());
  },
  /** Whether the page is reading aloud. */
  held: () => held,
  /**
   * Fetches the player as a press approaches, so it is there for the press. With the music left
   * on, it plays once here; failing that, the music is off on this page.
   */
  preload() {
    if (playable.length) load().catch(() => music.show('off'));
  },
  /** The panel opened: the player comes, and readies the piece it shows. */
  open() {
    if (playable.length)
      load().then(
        (loaded) => loaded.peek(),
        () => {},
      );
  },
  skip(step: number) {
    load().then(
      (loaded) => loaded.skip(step),
      () => {},
    );
  },
  seek(time: number) {
    player?.seek(time);
  },
  /** A piece picked from the list plays at once. */
  choose(index: number) {
    if (player) return player.choose(index);
    if (!navigator.onLine) return;
    prepared ??= prepare();
    pressed = true;
    music.show('playing');
    load().then(
      (loaded) => loaded.choose(index),
      () => music.show('off'),
    );
  },
  press() {
    const on = status !== 'playing';
    if (player) return on ? player.play() : player.stop();
    if (on && !navigator.onLine) return;
    prepared ??= prepare();
    pressed = on;
    music.show(on ? 'playing' : 'off');
    load().then(
      (loaded) => (pressed ? loaded.play() : loaded.stop()),
      () => music.show('off'),
    );
  },
};

/** Rests the music while the page reads aloud; the function returned brings it back. */
export function holdMusic() {
  held = true;
  player?.hold(true);
  return () => {
    held = false;
    player?.hold(false);
  };
}

if (playable.length) {
  // A page shown again, from the back button or from another tab, joins the music as it is now.
  // Once the player is here, it sees to this itself.
  const follow = () => {
    if (loading || document.visibilityState !== 'visible') return;
    const { on } = keptMusic();
    music.show(on ? 'paused' : 'off');
    if (on) music.preload();
  };
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) follow();
  });
  document.addEventListener('visibilitychange', follow);
}

// Left on, the music goes on from where it was, on this page as on the last.
if (status === 'paused') music.preload();
