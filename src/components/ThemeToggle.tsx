import { useEffect, useState } from 'react';
import Icon from './Icon';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset.theme === 'night' ? 'night' : 'day',
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'night' ? '#111e33' : '#f5faff');
    try {
      localStorage.setItem('alicia-sky-theme', theme);
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
