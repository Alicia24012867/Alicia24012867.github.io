import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import ThemeToggle from '../components/ThemeToggle';
import { signInUrl } from '../api/client';
import { signOut, useMe } from '../api/me';
import CommentsPanel from './CommentsPanel';
import MomentsPanel from './MomentsPanel';
import StatsPanel from './StatsPanel';
import MailPanel from './MailPanel';

const tabs = [
  { id: 'moments', label: 'Moments', icon: 'image', Panel: MomentsPanel },
  { id: 'comments', label: 'Comments', icon: 'pen', Panel: CommentsPanel },
  { id: 'stats', label: 'Stats', icon: 'sparkles', Panel: StatsPanel },
  { id: 'mail', label: 'Email', icon: 'mail', Panel: MailPanel },
] as const;
type Tab = (typeof tabs)[number]['id'];

const tabFromHash = (): Tab =>
  tabs.find((tab) => `#${tab.id}` === window.location.hash)?.id ?? 'moments';

/**
 * The blog's own admin page: post a Moment from the phone, read comments before they show,
 * and see views, subscribers and the emails sent to them. Only for the admin group; the API
 * checks that again on every request.
 */
export default function AdminApp() {
  const { loading, user } = useMe();
  const [tab, setTab] = useState(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const current = tabs.find((each) => each.id === tab)!;
  return (
    <div className="admin">
      <header className="admin-head">
        <a className="footer-brand" href="/">
          <Icon name="cloud" />
          Alicia.
        </a>
        <span className="admin-title">Admin</span>
        <span className="admin-spacer" />
        {user && (
          <span className="admin-who">
            {user.name} ·{' '}
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </span>
        )}
        <ThemeToggle />
      </header>
      {loading ? (
        <p className="admin-note" role="status">
          Loading…
        </p>
      ) : !user ? (
        <div className="admin-gate">
          <p className="eyebrow">
            <span aria-hidden="true" />
            ADMIN
          </p>
          <h1>Sign in to manage the blog</h1>
          <a className="button button-primary" href={signInUrl('/admin/')}>
            <Icon name="key" />
            Sign in
          </a>
        </div>
      ) : !user.admin ? (
        <div className="admin-gate">
          <h1>This page is for the blog’s owner</h1>
          <p>
            You’re signed in as {user.name}. <a href="/">Back to the site</a>
          </p>
        </div>
      ) : (
        <>
          <nav className="admin-tabs" aria-label="Admin sections">
            {tabs.map(({ id, label, icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className={id === tab ? 'is-active' : undefined}
                aria-current={id === tab ? 'page' : undefined}
              >
                <Icon name={icon} />
                {label}
              </a>
            ))}
          </nav>
          <main className="admin-main">
            <current.Panel />
          </main>
        </>
      )}
    </div>
  );
}
