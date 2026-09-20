import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import ThemeToggle from '../components/ThemeToggle';
import { profile } from '../config/profile';

const navigation = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'explore', label: 'Explore' },
  { id: 'contact', label: 'Contact' },
];

export default function HomeHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState('home');
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const sections = navigation
      .map(({ id }) => document.getElementById(id))
      .filter((element): element is HTMLElement => !!element);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-18% 0px -55% 0px', threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="header-inner">
        <a
          className="brand"
          href="#home"
          aria-label="Alicia home"
          onClick={() => setMenuOpen(false)}
        >
          <span className="brand-symbol">
            <Icon name="cloud" />
          </span>
          <span>
            Alicia<span className="brand-dot">.</span>
          </span>
          <span className="brand-note">A little personal universe</span>
        </a>
        <nav
          id="primary-navigation"
          className={`nav-links ${menuOpen ? 'is-open' : ''}`}
          aria-label="Main navigation"
        >
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={active === item.id ? 'is-active' : ''}
              aria-current={active === item.id ? 'location' : undefined}
              onClick={() => {
                setActive(item.id);
                setMenuOpen(false);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <a
            className="page-switch"
            href="./blog/"
            aria-label="Read the blog"
            title="Read the blog"
          >
            <Icon name="book" />
            <span>Blog</span>
          </a>
          <a
            className="page-switch"
            href="./notes/"
            aria-label="Browse the knowledge base"
            title="Notes / Knowledge Base"
          >
            <Icon name="code" />
            <span>Notes</span>
          </a>
          <ThemeToggle />
          <span className="header-divider" />
          <a
            className="icon-button github-button"
            href={profile.github}
            target="_blank"
            rel="noreferrer"
            aria-label="Visit Alicia on GitHub (opens in a new tab)"
          >
            <Icon name="github" />
          </a>
          <button
            ref={menuButton}
            className="icon-button mobile-menu-button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>
        </div>
      </div>
    </header>
  );
}
