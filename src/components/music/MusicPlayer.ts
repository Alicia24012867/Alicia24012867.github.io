import {
  fixedVolume,
  keptMusic,
  music,
  musicPlace,
  playable,
  startingPoint,
  type Player,
  type Prepared,
} from './music';
import { resumePoint, startAt, writtenMusic } from './place';
import { musicKey, pieceTitle, readMusic } from './tracks';

/** Soft enough to read by. */
const level = 0.3;
const fadeIn = 1500;
const fadeOut = 700;
/** How often the place is kept while the music plays, in milliseconds. */
const keepEvery = 2000;
/** This page, among the pages that may play the music. */
const page = Math.random().toString(36).slice(2);
const sources = playable.reduce((count, track) => count + track.sources.length, 0);

/**
 * Plays the pieces in `public/audio/` one after another, round and round, fading in and out.
 * The piece and the place in it are kept in this browser, so the next page goes on from there;
 * where the browser lets only a press start sound, the button waits, paused, for one.
 * One page plays at a time: the page the reader shows last takes the music over.
 */
export function createPlayer(prepared?: Prepared): Player {
  const audio = prepared?.audio ?? new Audio();
  audio.preload = 'none';
  let context = prepared?.context;
  let gain: GainNode | undefined;
  // The piece in the element, which of its formats, and where in it to begin.
  let index = -1;
  let format = 0;
  let start = 0;
  let failures = 0;
  // Whether the reader wants the music on, whether this page means to play it, and whether it
  // does, keeping the place for the next page.
  let on = false;
  let playing = false;
  let ours = false;
  let kept = 0;
  let started = -Infinity;
  // Counts starts and stops, so that the late answer of an earlier one is ignored.
  let turn = 0;
  let volume = 0;
  let target = 0;
  let endFade: ((done: boolean) => void) | undefined;

  const save = () => {
    const track = playable[index];
    kept = performance.now();
    try {
      localStorage.setItem(
        musicKey,
        writtenMusic({
          on,
          track: track?.name,
          time: track ? audio.currentTime : undefined,
          owner: ours ? page : undefined,
        }),
      );
    } catch {
      // Without storage, each page starts the music afresh.
    }
  };
  // Stops playing here, keeping the place for whichever page plays next.
  const letGo = () => {
    playing = false;
    if (!ours) return;
    ours = false;
    save();
  };

  // iPhones and iPads play the music softly only through the audio graph. It opens with a press,
  // and until then nothing plays.
  const route = () => {
    if (!fixedVolume) return;
    context ??= new AudioContext();
    if (gain) return;
    gain = context.createGain();
    gain.gain.value = 0;
    context.createMediaElementSource(audio).connect(gain).connect(context.destination);
  };
  const setVolume = (value: number) => {
    volume = value;
    if (gain && context) gain.gain.setTargetAtTime(value, context.currentTime, 0.015);
    else audio.volume = value;
  };
  // Even steps in loudness, rather than in volume, sound smooth.
  const fade = (to: number, duration: number) => {
    endFade?.(false);
    target = to;
    const from = Math.sqrt(volume);
    const span = Math.sqrt(to) - from;
    const began = performance.now();
    return new Promise<boolean>((done) => {
      const step = () => {
        const progress = Math.min(1, (performance.now() - began) / duration);
        setVolume((from + span * progress) ** 2);
        if (progress === 1) finish(true);
      };
      // Timers, unlike animation frames, still run in a hidden tab, if seldom.
      const timer = window.setInterval(step, 40);
      const finish = (completed: boolean) => {
        window.clearInterval(timer);
        if (endFade === finish) endFade = undefined;
        done(completed);
      };
      endFade = finish;
      step();
    });
  };

  // What the panel shows: before the piece has loaded, the time it is to begin at.
  const tell = () => {
    if (index < 0) return;
    musicPlace.tell({
      index,
      time: audio.readyState ? audio.currentTime : start,
      duration: audio.duration,
    });
  };
  const load = (next: number, time: number) => {
    index = next;
    format = 0;
    start = time;
    audio.src = playable[next].sources[0].src;
    audio.currentTime = time;
    tell();
    try {
      if (navigator.mediaSession && 'MediaMetadata' in window)
        navigator.mediaSession.metadata = new MediaMetadata({
          title: pieceTitle(playable[next].name),
        });
    } catch {
      // The system's controls then show the page instead.
    }
  };
  // The music sounds here now: it fades in, and this page keeps the place.
  const begin = () => {
    music.show('playing');
    ours = true;
    save();
    if (target !== level) fade(level, fadeIn);
  };

  const play = (press: boolean) => {
    const mine = ++turn;
    on = true;
    playing = true;
    started = performance.now();
    route();
    // Another page may have played on since this one did.
    if (keptMusic().track || index < 0) {
      const point = startingPoint();
      if (point.index !== index || audio.error) load(point.index, point.time);
      else if (Math.abs(audio.currentTime - point.time) > 1) audio.currentTime = point.time;
    } else if (audio.error) load(index, start);
    if (press) {
      music.show('playing');
      save();
    }
    // Turned on again while it fades out.
    if (!audio.paused) return begin();
    // Barely audible rather than silent, so that every browser applies its rule for sound now.
    // Paused at once before, as when the page was left, it fades in afresh.
    endFade?.(false);
    target = 0;
    setVolume(gain ? 0 : 0.001);
    const sound = () =>
      audio.play().catch((error: DOMException) => {
        // Not allowed without a press, so the button waits for one. Other failures come as an
        // error event, and the next format or piece is tried.
        if (mine !== turn || error.name !== 'NotAllowedError') return;
        playing = false;
        music.show('paused');
      });
    if (!context) sound();
    else if (press) {
      context.resume().catch(() => {});
      sound();
    } else
      // Without a press, the graph opens only where the browser allows sound by itself.
      context.resume().then(() => {
        if (mine === turn) sound();
      });
  };

  /** Fades out and pauses: off for good, or `paused` to go on later. */
  const stop = (next: 'off' | 'paused', duration = fadeOut) => {
    const mine = ++turn;
    playing = false;
    music.show(next);
    if (next === 'off') {
      on = false;
      save();
    }
    fade(0, duration).then((done) => {
      if (!done || mine !== turn) return;
      audio.pause();
      letGo();
    });
  };

  const shown = () => document.visibilityState === 'visible';
  // A page shown with the music on goes on from where the last page left it.
  const goOn = () => {
    if (!shown() || music.held()) return;
    if (!keptMusic().on) {
      if (on) stop('off');
      else music.show('off');
    } else if (!playing || !ours) play(false);
  };

  audio.addEventListener('playing', () => {
    failures = 0;
    if (playing) begin();
  });
  audio.addEventListener('loadedmetadata', () => {
    const at = startAt(start, audio.duration);
    if (at < 0) next();
    else if (Math.abs(audio.currentTime - at) > 1) audio.currentTime = at;
  });
  audio.addEventListener('timeupdate', () => {
    tell();
    if (ours && !audio.paused && performance.now() - kept > keepEvery) save();
  });
  for (const type of ['durationchange', 'seeked']) audio.addEventListener(type, tell);
  // One piece after another, round and round, each loaded afresh: the element's own looping, or
  // going back to the start, can leave iPhones reporting a time that no longer moves.
  const next = () => {
    load((index + 1) % playable.length, 0);
    if (playing) audio.play().catch(() => {});
    if (ours) save();
  };
  audio.addEventListener('ended', next);

  // Another piece from the panel. Playing, it fades in from silence; otherwise it waits there.
  const skip = (step: number) => {
    const from = index < 0 ? startingPoint().index : index;
    if (playing) {
      endFade?.(false);
      target = 0;
      setVolume(gain ? 0 : 0.001);
    }
    audio.preload = 'metadata';
    load((((from + step) % playable.length) + playable.length) % playable.length, 0);
    if (playing) audio.play().catch(() => {});
    save();
  };
  const seek = (time: number) => {
    if (index < 0 || !Number.isFinite(audio.duration)) return;
    start = Math.max(0, Math.min(time, audio.duration));
    audio.currentTime = start;
    tell();
    save();
  };
  audio.addEventListener('error', () => {
    if (index < 0 || !audio.getAttribute('src')) return;
    // When nothing plays, perhaps for want of a connection, the button waits for a press.
    if (++failures >= sources) {
      failures = 0;
      turn++;
      letGo();
      music.show(on ? 'paused' : 'off');
      return;
    }
    const track = playable[index];
    if (format + 1 < track.sources.length) {
      format++;
      audio.src = track.sources[format].src;
      audio.currentTime = start;
    } else load((index + 1) % playable.length, 0);
    if (playing) audio.play().catch(() => {});
  });
  // Paused by the browser or the system, such as for a call or for another tab: the music
  // stays on, and a press brings it back. The pause from leaving a page can arrive only once it is
  // back and playing again, as on iPhones, and is passed over.
  audio.addEventListener('pause', () => {
    if (audio.ended || !audio.paused || !playing) return;
    turn++;
    letGo();
    music.show('paused');
  });

  // Another page took the music over, or the reader turned it off there.
  window.addEventListener('storage', (event) => {
    if (event.key !== musicKey && event.key !== null) return;
    const state = keptMusic();
    const off = !state.on;
    // The page just left kept its place a moment after this one began, as can happen with the
    // back button: the music goes on from that place instead.
    const left = readMusic(event.newValue);
    if (left.on && !left.owner && left.track && playing && performance.now() - started < 3000) {
      const point = resumePoint(playable, left);
      if (point.index !== index) {
        load(point.index, point.time);
        audio.play().catch(() => {});
      } else if (Math.abs(audio.currentTime - point.time) > 1) audio.currentTime = point.time;
      return;
    }
    if (!(off && on) && !(state.owner && state.owner !== page && playing)) return;
    turn++;
    playing = false;
    ours = false;
    if (off) on = false;
    music.show(off ? 'off' : 'paused');
    fade(0, fadeOut).then((done) => {
      if (done && !playing) audio.pause();
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (shown()) goOn();
    // The place, kept fresh for a page about to take the music over.
    else if (ours) save();
  });
  // A page leaves without a fade; kept for the back button, it comes back to the music as is.
  window.addEventListener('pagehide', () => {
    turn++;
    letGo();
    audio.pause();
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    music.show(keptMusic().on ? 'paused' : 'off');
    goOn();
  });

  // The system's media controls (keys, headphones, the lock screen) work as the button does.
  try {
    navigator.mediaSession?.setActionHandler('play', () => play(true));
    navigator.mediaSession?.setActionHandler('pause', () => stop('off'));
    navigator.mediaSession?.setActionHandler('previoustrack', () => skip(-1));
    navigator.mediaSession?.setActionHandler('nexttrack', () => skip(1));
  } catch {
    // Without them, the system pauses the element itself, and the button follows.
  }

  // Shown as paused, the music was left on, and goes on here; shown as playing, a press is
  // about to start it.
  if (music.get() === 'paused') goOn();
  return {
    play: () => play(true),
    stop: () => stop('off'),
    hold(rest) {
      if (!rest) goOn();
      else if (playing) stop('paused', fadeOut / 2);
    },
    skip,
    seek,
    peek() {
      if (index >= 0) return tell();
      const point = startingPoint();
      audio.preload = 'metadata';
      load(point.index, point.time);
    },
  };
}
