import './subscribe.css';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Icon from '../components/Icon';
import { api, failure } from '../api/client';

type Said = { text: string; wrong?: boolean };

/**
 * A line above the footer: an email address in, and each new post arrives by email. The links
 * in those emails come back here, to say a subscription is confirmed, or to ask before ending
 * one.
 */
export default function Subscribe() {
  const band = useRef<HTMLElement>(null);
  const [said, setSaid] = useState<Said>();
  const [sending, setSending] = useState(false);
  const [leaving, setLeaving] = useState<string>();

  // What the confirmation and unsubscribe links bring with them, read once and taken off the
  // address so a reload doesn't repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const confirmed = params.get('subscription');
    const leave = params.get('unsubscribe');
    if (confirmed === null && leave === null) return;
    params.delete('subscription');
    params.delete('unsubscribe');
    const rest = params.toString();
    history.replaceState(
      history.state,
      '',
      window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
    );
    if (confirmed === 'confirmed')
      setSaid({ text: 'You’re subscribed. New posts will come to your inbox.' });
    else if (confirmed !== null)
      setSaid({
        text: 'That link has expired or was already used. You can subscribe again below.',
        wrong: true,
      });
    if (leave) setLeaving(leave);
    requestAnimationFrame(() => band.current?.scrollIntoView({ block: 'center' }));
  }, []);

  const subscribe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setSending(true);
    setSaid(undefined);
    try {
      await api('/api/subscriptions', {
        json: { email: String(data.get('email') ?? '').trim(), website: data.get('website') ?? '' },
      });
      form.reset();
      setSaid({ text: 'Almost there: please open the email I just sent and confirm.' });
    } catch (error) {
      setSaid({ text: failure(error, 'subscribe you'), wrong: true });
    } finally {
      setSending(false);
    }
  };

  const unsubscribe = async () => {
    if (!leaving || sending) return;
    setSending(true);
    try {
      await api('/api/subscriptions/unsubscribe', { json: { token: leaving } });
      setLeaving(undefined);
      setSaid({ text: 'Done. No more emails will come from here.' });
    } catch (error) {
      setSaid({ text: failure(error, 'unsubscribe you'), wrong: true });
    } finally {
      setSending(false);
    }
  };

  return (
    <section ref={band} className="subscribe page-width" aria-labelledby="subscribe-title">
      <div className="subscribe-words">
        <h2 id="subscribe-title">
          <Icon name="mail" />
          New posts by email
        </h2>
        <p>One email when something new goes up. Nothing else, and you can stop anytime.</p>
      </div>
      {leaving ? (
        <div className="subscribe-leave">
          <p>Stop the emails about new posts?</p>
          <div>
            <button
              className="button button-primary"
              type="button"
              disabled={sending}
              onClick={unsubscribe}
            >
              Unsubscribe
            </button>
            <button
              className="button button-ghost"
              type="button"
              onClick={() => setLeaving(undefined)}
            >
              Keep them
            </button>
          </div>
        </div>
      ) : (
        <form className="subscribe-form" onSubmit={subscribe}>
          <label className="subscribe-field">
            <span className="subscribe-hidden">Your email</span>
            <input
              name="email"
              type="email"
              required
              maxLength={200}
              autoComplete="email"
              placeholder="you@example.com"
              readOnly={sending}
            />
          </label>
          <input
            className="subscribe-trap"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />
          <button className="button button-primary" type="submit" disabled={sending}>
            {sending ? 'Sending…' : 'Subscribe'}
          </button>
        </form>
      )}
      {said && (
        <p className={`subscribe-said${said.wrong ? ' is-wrong' : ''}`} role="status">
          {said.text}
        </p>
      )}
    </section>
  );
}
