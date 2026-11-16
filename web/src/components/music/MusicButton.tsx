import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import Icon from '../Icon';
import { textLanguage } from '../../content/language.mjs';
import { music, musicMode, musicPlace, playable } from './music';
import { musicModes, pieceTitle, type MusicMode } from './tracks';
import './music.css';

/** How long the mouse rests on the note before the panel opens, and may stray before it closes. */
const hoverOpen = 450;
const hoverClose = 350;
const margin = 16;

const orders: Record<MusicMode, { name: string; icon: 'repeat' | 'repeatOne' | 'shuffle' }> = {
  all: { name: 'Repeat all', icon: 'repeat' },
  one: { name: 'Repeat one', icon: 'repeatOne' },
  shuffle: { name: 'Shuffle', icon: 'shuffle' },
};
// Whether the list of pieces shows, kept while the page is open.
let listShown = false;

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** The piece playing, how far it is, and the controls to play, pause, skip and move in it. */
function MusicPanel({ id, style }: { id: string; style: CSSProperties }) {
  const status = useSyncExternalStore(music.subscribe, music.get);
  const place = useSyncExternalStore(musicPlace.subscribe, musicPlace.get);
  const mode = useSyncExternalStore(musicMode.subscribe, musicMode.get);
  // Where the reader drags the bar to, until they let go.
  const [drag, setDrag] = useState<number>();
  const [list, setList] = useState(listShown);
  const bar = useRef<HTMLInputElement>(null);
  const title = pieceTitle(playable[place.index]?.name ?? '');
  const known = Number.isFinite(place.duration) && place.duration > 0;
  const time = Math.min(drag ?? place.time, known ? place.duration : Infinity);
  const several = playable.length > 1;
  const playing = status === 'playing';

  // The bar moves the music once it is let go, not at every step of the drag.
  useEffect(() => {
    const input = bar.current;
    if (!input) return;
    const onChange = () => {
      music.seek(Number(input.value));
      setDrag(undefined);
    };
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, []);

  return (
    <div
      id={id}
      className="music-panel"
      role="group"
      aria-label="Background music"
      style={
        {
          ...style,
          '--progress': known ? `${(time / place.duration) * 100}%` : '0%',
        } as CSSProperties
      }
    >
      <div className="music-panel-head">
        <span>Now playing</span>
        {several && (
          <span className="music-panel-count">
            {place.index + 1} / {playable.length}
          </span>
        )}
      </div>
      <p className="music-panel-title" lang={textLanguage(title)} title={title}>
        {title}
      </p>
      <input
        ref={bar}
        className="music-panel-bar"
        type="range"
        min={0}
        max={known ? place.duration : 1}
        step="any"
        value={known ? time : 0}
        disabled={!known}
        aria-label="Position"
        aria-valuetext={known ? `${clock(time)} of ${clock(place.duration)}` : undefined}
        onChange={(event) => setDrag(Number(event.target.value))}
      />
      <div className="music-panel-times" aria-hidden="true">
        <span>{clock(time)}</span>
        <span>{known ? clock(place.duration) : '–:––'}</span>
      </div>
      <div className="music-panel-controls">
        <button
          type="button"
          className="icon-button music-panel-option"
          aria-label={`Order: ${orders[mode].name}`}
          title={orders[mode].name}
          onClick={() =>
            musicMode.set(musicModes[(musicModes.indexOf(mode) + 1) % musicModes.length])
          }
        >
          <Icon name={orders[mode].icon} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Previous piece"
          disabled={!several}
          onClick={() => music.skip(-1)}
        >
          <Icon name="previous" />
        </button>
        <button
          type="button"
          className="icon-button music-panel-play"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={music.press}
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Next piece"
          disabled={!several}
          onClick={() => music.skip(1)}
        >
          <Icon name="next" />
        </button>
        <button
          type="button"
          className="icon-button music-panel-option"
          aria-label="All pieces"
          title="All pieces"
          aria-expanded={list}
          aria-controls={`${id}-list`}
          onClick={() => {
            listShown = !list;
            setList(!list);
          }}
        >
          <Icon name="list" />
        </button>
      </div>
      {list && (
        <ol id={`${id}-list`} className="music-panel-list" aria-label="All pieces">
          {playable.map((track, index) => {
            const name = pieceTitle(track.name);
            const here = index === place.index;
            return (
              <li key={track.name}>
                <button
                  type="button"
                  aria-current={here || undefined}
                  className={here && playing ? 'is-playing' : undefined}
                  onClick={() => music.choose(index)}
                >
                  <span className="music-panel-number" aria-hidden="true">
                    {here && playing ? <Icon name="music" /> : index + 1}
                  </span>
                  <span lang={textLanguage(name)}>{name}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/**
 * The note in the header, there only with music to play. A press, or the mouse resting on it,
 * opens the panel; the music stays off until the reader plays it there.
 */
export default function MusicButton() {
  const status = useSyncExternalStore(music.subscribe, music.get);
  // Open from a press stays open; from the mouse resting on the note, it closes as the mouse leaves.
  const [open, setOpen] = useState<'press' | 'hover'>();
  const [spot, setSpot] = useState<{ left: number; top: number; caret: number }>();
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);
  // Whether the panel opened from the keyboard, and so takes the keyboard in.
  const keyboard = useRef(false);

  const wait = (then: () => void, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(then, delay);
  };
  const close = (refocus = false) => {
    window.clearTimeout(timer.current);
    if (refocus) button.current?.focus();
    setOpen(undefined);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    music.open();
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node && root.current?.contains(event.target))) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(root.current?.contains(document.activeElement));
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Below the note, inside the screen, its caret pointing at the note.
  const panelOpen = !!open;
  useLayoutEffect(() => {
    if (!panelOpen) return setSpot(undefined);
    const measure = () => {
      const panel = root.current?.querySelector<HTMLElement>('.music-panel');
      const note = button.current?.getBoundingClientRect();
      const frame = panel?.offsetParent?.getBoundingClientRect();
      if (!panel || !note || !frame) return;
      const width = panel.offsetWidth;
      const centre = note.left + note.width / 2;
      const room = document.documentElement.clientWidth - margin;
      const left = Math.max(margin, Math.min(centre - width / 2, room - width));
      setSpot({
        left: left - frame.left,
        top: note.bottom + 10 - frame.top,
        caret: Math.max(14, Math.min(centre - left, width - 14)),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [panelOpen]);

  // Opened from the keyboard, the keyboard goes on inside the panel.
  const placed = !!spot;
  useEffect(() => {
    if (placed && keyboard.current)
      root.current?.querySelector<HTMLElement>('.music-panel-play')?.focus({ preventScroll: true });
  }, [placed]);

  if (!playable.length) return null;
  return (
    <span
      ref={root}
      className="music-control"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return;
        music.preload();
        if (open) window.clearTimeout(timer.current);
        else wait(() => setOpen('hover'), hoverOpen);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        if (!open) window.clearTimeout(timer.current);
        else if (open === 'hover') wait(() => setOpen(undefined), hoverClose);
      }}
      // Taken in hand, the panel stays as the mouse leaves, as while dragging the bar.
      onPointerDown={(event) => {
        if (open && !button.current?.contains(event.target as Node)) setOpen('press');
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (open && next && !event.currentTarget.contains(next)) close();
      }}
    >
      <button
        ref={button}
        type="button"
        className={`icon-button music-button${status === 'playing' ? ' is-playing' : ''}${status === 'paused' ? ' is-paused' : ''}`}
        aria-label="Background music"
        aria-haspopup="true"
        aria-expanded={!!open}
        aria-controls={open ? id : undefined}
        onPointerDown={music.preload}
        onFocus={music.preload}
        onClick={(event) => {
          keyboard.current = event.detail === 0;
          // A press soon after the mouse opened it keeps it open, rather than closing it at once.
          if (open === 'press') close();
          else {
            window.clearTimeout(timer.current);
            setOpen('press');
          }
        }}
      >
        <Icon name="music" />
      </button>
      {open && (
        <MusicPanel
          id={id}
          style={
            {
              left: spot?.left ?? 0,
              top: spot?.top ?? 0,
              visibility: spot ? undefined : 'hidden',
              '--caret': `${spot?.caret ?? 0}px`,
            } as CSSProperties
          }
        />
      )}
    </span>
  );
}
