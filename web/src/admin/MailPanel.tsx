import blogTitles from 'virtual:articles/titles';
import noteTitles from 'virtual:notes/titles';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Icon from '../components/Icon';
import { api, failure } from '../api/client';
import type { Newsletter, Subscriber } from '../api/types';
import { articlePath } from '../content/urls';
import { Status, useLoad, when } from './shared';

type Subscribers = {
  subscribers: Subscriber[];
  counts: { pending: number; confirmed: number };
};

// What an email can be about: any post or note.
const documents = [
  ...blogTitles.map(([slug, title]) => ({ path: articlePath('blog', slug), title })),
  ...noteTitles.map(([slug, title]) => ({
    path: articlePath('notes', slug),
    title: `Note: ${title}`,
  })),
];

/** Who gets an email for new posts, and the emails sent to them. */
export default function MailPanel() {
  return (
    <section className="admin-panel" aria-labelledby="mail-heading">
      <h1 id="mail-heading">Email</h1>
      <Newsletters />
      <SubscriberList />
    </section>
  );
}

function Newsletters() {
  const load = useCallback(() => api<{ newsletters: Newsletter[] }>('/api/admin/newsletters'), []);
  const { value, error, reload } = useLoad(load);
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState<{ text: string; wrong?: boolean }>();
  const busy = value?.newsletters.some((newsletter) => newsletter.status === 'sending');

  // While one is still going out, its counts are checked every few seconds.
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(reload, 3000);
    return () => window.clearTimeout(timer);
  }, [busy, value, reload]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const subject = String(data.get('subject') ?? '').trim();
    const path = String(data.get('path') ?? '');
    if (!window.confirm(`Send “${subject}” to every confirmed subscriber now?`)) return;
    setSending(true);
    setSaid(undefined);
    try {
      await api<Newsletter>('/api/admin/newsletters', {
        json: { subject, text: String(data.get('text') ?? ''), path: path || null },
      });
      form.reset();
      setSaid({ text: 'Sending. The counts below fill in as it goes.' });
      reload();
    } catch (failed) {
      setSaid({ text: failure(failed, 'send it'), wrong: true });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <h2 className="admin-subhead">Send an email</h2>
      <form className="admin-form" onSubmit={send}>
        <label className="admin-field">
          <span>About</span>
          <select name="path" defaultValue="">
            <option value="">Nothing in particular</option>
            {documents.map((page) => (
              <option key={page.path} value={page.path}>
                {page.title}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Subject</span>
          <input name="subject" required maxLength={200} />
        </label>
        <label className="admin-field">
          <span>Message (Markdown)</span>
          <textarea name="text" rows={6} required maxLength={20000} />
        </label>
        <div className="admin-row">
          <button className="button button-primary" type="submit" disabled={sending}>
            <Icon name="mail" />
            {sending ? 'Sending…' : 'Send to subscribers'}
          </button>
        </div>
        {said && (
          <p className={`admin-note${said.wrong ? ' is-wrong' : ''}`} role="status">
            {said.text}
          </p>
        )}
      </form>
      <h2 className="admin-subhead">Sent</h2>
      <Status error={error} loading={!value && !error} />
      {value && !value.newsletters.length && <p className="admin-note">Nothing sent yet.</p>}
      <ol className="admin-list">
        {value?.newsletters.map((newsletter) => (
          <li key={newsletter.id} className="admin-card">
            <header className="admin-card-head">
              <strong>{newsletter.subject}</strong>
              <span className={`admin-chip is-${newsletter.status}`}>{newsletter.status}</span>
            </header>
            <p className="admin-meta">
              {when(newsletter.createdAt)}
              {newsletter.path && (
                <>
                  {' · '}
                  <a href={newsletter.path}>{newsletter.path}</a>
                </>
              )}
              {' · '}
              {newsletter.sent} of {newsletter.recipients} sent
              {newsletter.failed > 0 && `, ${newsletter.failed} failed`}
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}

function SubscriberList() {
  const load = useCallback(() => api<Subscribers>('/api/admin/subscribers'), []);
  const { value, setValue, error } = useLoad(load);
  const [problem, setProblem] = useState<string>();

  const remove = async (subscriber: Subscriber) => {
    if (!window.confirm(`Stop emailing ${subscriber.email}?`)) return;
    setProblem(undefined);
    try {
      await api(`/api/admin/subscribers/${subscriber.id}`, { method: 'DELETE' });
      setValue(
        (value) =>
          value && {
            subscribers: value.subscribers.filter((each) => each.id !== subscriber.id),
            counts: {
              ...value.counts,
              [subscriber.status]: value.counts[subscriber.status] - 1,
            },
          },
      );
    } catch (failed) {
      setProblem(failure(failed, 'remove them'));
    }
  };

  return (
    <>
      <h2 className="admin-subhead">
        Subscribers
        {value && (
          <span>
            {value.counts.confirmed} confirmed · {value.counts.pending} waiting
          </span>
        )}
      </h2>
      <Status error={error ?? problem} loading={!value && !error} />
      {value && !value.subscribers.length && <p className="admin-note">No one yet.</p>}
      <ul className="admin-rows">
        {value?.subscribers.map((subscriber) => (
          <li key={subscriber.id}>
            <span className="admin-email">{subscriber.email}</span>
            <span className={`admin-chip is-${subscriber.status}`}>{subscriber.status}</span>
            <span className="admin-meta">
              {when(subscriber.confirmedAt ?? subscriber.createdAt)}
            </span>
            <button className="admin-danger" type="button" onClick={() => remove(subscriber)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
