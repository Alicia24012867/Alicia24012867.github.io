import { useEffect, useState } from 'react';
import Icon from './Icon';

const themeKey = 'alicia-sky-theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset.theme === 'night' ? 'night' : 'day',
  );

  useEffect(() => {
    // The theme may have changed elsewhere since this page set it: in another tab, or while
    // the page waited unseen, opened ahead of a click or kept for the back button.
    const sync = () => {
      try {
        setTheme(localStorage.getItem(themeKey) === 'night' ? 'night' : 'day');
      } catch {
        /* Without storage, each page keeps its own theme. */
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === themeKey) sync();
    };
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('prerenderingchange', sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('prerenderingchange', sync);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'night' ? '#111e33' : '#f5faff');
    try {
      localStorage.setItem(themeKey, theme);
    } catch {
      /* Theme works without storage. */
    }
  }, [theme]);

  const label = theme === 'day' ? 'Switch to dark theme' : 'Switch to light theme';
  return (
    <button
      className="icon-button theme-toggle"
      onClick={() => setTheme(theme === 'day' ? 'night' : 'day')}
      aria-label={label}
      title={label}
    >
      <Icon name={theme === 'day' ? 'sun' : 'moon'} />
    </button>
  );
}
