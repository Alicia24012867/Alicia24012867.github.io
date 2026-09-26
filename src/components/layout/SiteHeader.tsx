import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import ThemeToggle from '../ThemeToggle';
import { profile } from '../../config/profile';
import { friendLinks, homepageLinks } from '../../config/links';
import { listingUrl, queryFromSearch } from '../../content/urls';
import './site-header.css';

const pages = [
  { id: 'home', label: 'Home', href: '/#home' },
  { id: 'blog', label: 'Blog', href: '/blog/' },
  { id: 'notes', label: 'Notes', href: '/notes/' },
] as const;
export type SiteSection = (typeof pages)[number]['id'] | 'not-found';
const sections = [
  { id: 'about', label: 'About' },
  { id: 'explore', label: 'Explore' },
  { id: 'contact', label: 'Contact' },
  ...([...homepageLinks, ...friendLinks].some((link) => link.name.trim() && link.url.trim())
    ? [{ id: 'links', label: 'Links' }]
    : []),
];

export default function SiteHeader({ section }: { section: SiteSection }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState('home');
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const query = queryFromSearch(window.location.search);
  const reading = new URLSearchParams(window.location.search).has('post');

  useEffect(() => {
    if (section !== 'home') return;
    // Cross-page anchors can arrive before React has mounted the target sections.
    const anchor = ['home', ...sections.map((item) => item.id)].find(
      (id) => window.location.hash === `#${id}`,
    );
    const frame = anchor
      ? requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView())
      : 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: '-18% 0px -55% 0px', threshold: 0 },
    );
    for (const id of ['home', ...sections.map((item) => item.id)]) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [section]);

  useEffect(() => {
    if (!menuOpen) return;
    header.current?.querySelector<HTMLAnchorElement>('nav a')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target))
        setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    const viewport = window.matchMedia('(max-width: 800px)');
    const onResize = () => setMenuOpen(false);
    viewport.addEventListener('change', onResize);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      viewport.removeEventListener('change', onResize);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header
      ref={header}
      className="site-header"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
      }}
    >
      <div className="header-inner">
        <a
          className="brand"
          href="/#home"
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
          id="site-navigation"
          className={`site-navigation ${menuOpen ? 'is-open' : ''}`}
          aria-label="Site navigation"
        >
          {pages.map((page) => (
            <a
              key={page.id}
              href={page.id === section && reading ? listingUrl(query) : page.href}
              aria-current={page.id === section ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {page.label}
            </a>
          ))}
          {sections.map((item, index) => (
            <a
              key={item.id}
              href={`/#${item.id}`}
              className={index === 0 ? 'site-section-start' : undefined}
              aria-current={section === 'home' && active === item.id ? 'location' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <ThemeToggle />
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
            className="icon-button site-menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="site-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>
        </div>
      </div>
    </header>
  );
}
