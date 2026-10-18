import { useSyncExternalStore } from 'react';
import Icon from '../Icon';
import { music, playable } from './music';
import './music.css';

const titles = {
  off: 'Play background music',
  playing: 'Pause background music',
  paused: 'Resume background music',
};

/** The note in the header: off until the reader turns it on, and there only with music to play. */
export default function MusicButton() {
  const status = useSyncExternalStore(music.subscribe, music.get);
  if (!playable.length) return null;
  return (
    <button
      type="button"
      className={`icon-button music-button${status === 'paused' ? ' is-paused' : ''}`}
      aria-label="Background music"
      aria-pressed={status === 'playing'}
      title={titles[status]}
      onPointerEnter={music.preload}
      onPointerDown={music.preload}
      onFocus={music.preload}
      onClick={music.press}
    >
      <Icon name="music" />
    </button>
  );
}
