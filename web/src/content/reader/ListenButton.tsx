import { useSyncExternalStore } from 'react';
import Icon from '../../components/Icon';
import { listening } from './listening';

/** Starts reading the document aloud from the header, then pauses and resumes it. */
export default function ListenButton() {
  const { status, available } = useSyncExternalStore(listening.subscribe, listening.get);
  if (!available) return null;
  return (
    <span className="article-listen">
      <button
        type="button"
        className={status === 'off' ? undefined : 'is-active'}
        onClick={listening.toggle}
      >
        <Icon name={status === 'playing' ? 'pause' : status === 'paused' ? 'play' : 'headphones'} />
        {status === 'playing' ? 'Pause' : status === 'paused' ? 'Resume' : 'Listen'}
      </button>
    </span>
  );
}
