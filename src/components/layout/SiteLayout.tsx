import type { ReactNode } from 'react';
import Icon from '../Icon';
import SiteHeader, { type SiteSection } from './SiteHeader';
import { profile } from '../../config/profile';

const siteClasses: Record<SiteSection, string | undefined> = {
  home: undefined,
  blog: 'blog-site',
  notes: 'blog-site notes-site',
  'not-found': 'not-found-site',
};

export default function SiteLayout({
  section,
  children,
}: {
  section: SiteSection;
  children: ReactNode;
}) {
  const home = section === 'home';
  const homeUrl = home ? '#home' : '/#home';
  return (
    <div className={siteClasses[section]}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader section={section} />
      <main id="main">{children}</main>
      <footer className="site-footer page-width">
        <div>
          <a className="footer-brand" href={homeUrl}>
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
        <a href={homeUrl}>
          {home ? 'Back to top' : 'Back to home'}
          <Icon name="arrow" className={home ? 'up-arrow' : undefined} />
        </a>
      </footer>
    </div>
  );
}
