import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { nextSkyChange, skyMood } from './skyMood';

/** The hero's mood card, following the visitor's local time of day. */
export default function SkyNote() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setTimeout(
      () => setNow(new Date()),
      nextSkyChange(now).getTime() - Date.now(),
    );
    // Background tabs and sleeping devices delay timers; a returning visitor catches up.
    const refresh = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [now]);

  const mood = skyMood(now);
  return (
    <div className="sky-note" data-sky={mood.period}>
      <span className="sky-note-icon">
        <Icon name={mood.icon} />
      </span>
      <div>
        <span className="sky-note-label">{mood.label}</span>
        <p>{mood.line}</p>
      </div>
      <span className="sky-note-star" aria-hidden="true">
        ✧
      </span>
    </div>
  );
}
