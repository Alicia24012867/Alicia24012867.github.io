import type { ReactNode } from 'react';
import Icon from '../Icon';
import SiteHeader from './SiteHeader';
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
      <SiteHeader section={section} />
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
