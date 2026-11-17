import { useRef } from 'react';
import { comments } from '../config/comments';
import { absoluteUrl } from '../content/urls';
import { features } from '../config/features';
import { useCommentWidget } from '../hooks/useCommentWidget';
import { useNearLoad } from '../hooks/useNearLoad';

// Every note goes into one discussion, titled with this term.
const term = 'Guestbook';
const backlink = absoluteUrl('/#guestbook');

const loadThread = () => import('../comments/CommentThread').then(({ default: Thread }) => Thread);

/** Notes from visitors under Contact. */
export default function Guestbook() {
  return features.comments ? <SiteGuestbook /> : <GiscusGuestbook />;
}

function SiteGuestbook() {
  const container = useRef<HTMLElement>(null);
  const { value: Thread, failed, offline } = useNearLoad(container, loadThread);

  return (
    <section ref={container} id="guestbook" className="guestbook" aria-labelledby="guestbook-title">
      <h3 id="guestbook-title">Guestbook</h3>
      <div className="guestbook-intro">
        <p>
          Passing through? Say hi, share a thought, or leave a few kind words for whoever visits
          next.
        </p>
      </div>
      <div className="guestbook-widget">
        {Thread ? (
          <Thread
            thread="guestbook"
            back="/#guestbook"
            words={{
              noun: 'note',
              send: 'Sign the guestbook',
              placeholder: 'Leave a note…',
              empty: 'No notes yet. Yours could be the first.',
            }}
          />
        ) : failed ? (
          <div className="guestbook-status" role="status">
            <p>The guestbook couldn’t load. Please try again.</p>
            <button className="button button-ghost" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        ) : (
          <p className="guestbook-status" role="status">
            {offline
              ? 'The guestbook will open once you’re back online.'
              : 'Opening the guestbook…'}
          </p>
        )}
      </div>
    </section>
  );
}

/** Kept in the same GitHub discussions as post comments. */
function GiscusGuestbook() {
  const container = useRef<HTMLElement>(null);
  const { Widget, failed, offline, theme } = useCommentWidget(container, backlink);

  return (
    <section ref={container} id="guestbook" className="guestbook" aria-labelledby="guestbook-title">
      <h3 id="guestbook-title">Guestbook</h3>
      <div className="guestbook-intro">
        <p>
          Passing through? Say hi, share a thought, or leave a few kind words for whoever visits
          next.
        </p>
        <a
          className="guestbook-link"
          href={`https://github.com/${comments.repo}/discussions?discussions_q=${encodeURIComponent(term)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open the guestbook on GitHub <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className="guestbook-widget">
        {Widget ? (
          <Widget
            id="giscus-guestbook"
            {...comments}
            mapping="specific"
            term={term}
            strict="1"
            reactionsEnabled="1"
            emitMetadata="0"
            inputPosition="top"
            theme={theme}
            loading="lazy"
          />
        ) : failed ? (
          <div className="guestbook-status" role="status">
            <p>The guestbook couldn’t load. You can try again or open it on GitHub.</p>
            <button className="button button-ghost" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        ) : (
          <p className="guestbook-status" role="status">
            {offline
              ? 'The guestbook will open once you’re back online.'
              : 'Opening the guestbook…'}
          </p>
        )}
      </div>
    </section>
  );
}
