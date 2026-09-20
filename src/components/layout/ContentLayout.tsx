import type { ReactNode } from 'react';
import Icon from '../Icon';
import ThemeToggle from '../ThemeToggle';
import { profile } from '../../config/profile';

export default function ContentLayout({
  section,
  children,
}: {
  section: 'blog' | 'notes';
  children: ReactNode;
}) {
  return (
    <div className={`blog-site ${section === 'notes' ? 'notes-site' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="../#home" aria-label="Alicia home">
            <span className="brand-symbol">
              <Icon name="cloud" />
            </span>
            <span>
              Alicia<span className="brand-dot">.</span>
            </span>
            <span className="brand-note">A little personal universe</span>
          </a>
          <nav className="journal-nav" aria-label="Content navigation">
            <a href="../blog/" aria-current={section === 'blog' ? 'page' : undefined}>
              Blog
            </a>
            <a href="../notes/" aria-current={section === 'notes' ? 'page' : undefined}>
              Notes
            </a>
          </nav>
          <div className="header-actions">
            <a
              className="page-switch journal-home-switch"
              href="../#home"
              aria-label="Back to home"
            >
              <Icon name="arrow" className="back-arrow" />
              <span>Home</span>
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer page-width">
        <div>
          <a className="footer-brand" href="../#home">
            <Icon name="cloud" />
            Alicia.
          </a>
          <span>
            © {new Date().getFullYear()} {profile.fullName}
          </span>
        </div>
        <p>
          Logic in code. Poetry in life.<span>✧</span>
        </p>
        <a href="../#home">
          Back to home
          <Icon name="arrow" />
        </a>
      </footer>
    </div>
  );
}
