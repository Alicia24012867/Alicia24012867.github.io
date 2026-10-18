import { useRef } from 'react';
import { comments } from '../config/comments';
import { absoluteUrl } from '../content/urls';
import { useCommentWidget } from '../hooks/useCommentWidget';

// Every note goes into one discussion, titled with this term.
const term = 'Guestbook';
const backlink = absoluteUrl('/#guestbook');

/** Notes from visitors under Contact, kept in the same GitHub discussions as post comments. */
export default function Guestbook() {
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
