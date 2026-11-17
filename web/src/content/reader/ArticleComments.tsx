import { useRef } from 'react';
import { comments } from '../../config/comments';
import { features } from '../../config/features';
import { useCommentWidget } from '../../hooks/useCommentWidget';
import { useNearLoad } from '../../hooks/useNearLoad';
import { commentIdentity } from './comments';
import type { Collection } from '../urls';

type Props = { collection: Collection; slug: string };

const loadThread = () =>
  import('../../comments/CommentThread').then(({ default: Thread }) => Thread);

/** The comments and what shows them are fetched only near the end of the article. */
export default function ArticleComments(props: Props) {
  return features.comments ? <SiteComments {...props} /> : <GiscusComments {...props} />;
}

function SiteComments({ collection, slug }: Props) {
  const container = useRef<HTMLElement>(null);
  const { term: path } = commentIdentity(collection, slug);
  const { value: Thread, failed, offline } = useNearLoad(container, loadThread);

  return (
    <section
      ref={container}
      id="comments"
      className="article-comments"
      aria-labelledby="comments-title"
    >
      <header className="comments-heading">
        <p className="eyebrow">
          <span aria-hidden="true" />
          CONVERSATION
        </p>
        <h2 id="comments-title">Leave a thought</h2>
        <p>Questions, ideas, or a little hello.</p>
      </header>
      <div className="comments-widget">
        {Thread ? (
          <Thread
            key={path}
            thread={path}
            back={`${path}#comments`}
            words={{
              noun: 'comment',
              send: 'Post',
              placeholder: 'Say something about this…',
              empty: 'No comments yet. Yours could be the first.',
            }}
          />
        ) : failed ? (
          <div className="comments-status" role="status">
            <p>Comments couldn’t load. Please try again.</p>
            <button className="button button-ghost" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        ) : (
          <p className="comments-status" role="status">
            {offline ? 'Comments will load once you’re back online.' : 'Loading comments…'}
          </p>
        )}
      </div>
    </section>
  );
}

function GiscusComments({ collection, slug }: Props) {
  const container = useRef<HTMLElement>(null);
  const { term, backlink } = commentIdentity(collection, slug);
  const { Widget, failed, offline, theme } = useCommentWidget(container, backlink);

  return (
    <section
      ref={container}
      id="comments"
      className="article-comments"
      aria-labelledby="comments-title"
    >
      <header className="comments-heading">
        <p className="eyebrow">
          <span aria-hidden="true" />
          CONVERSATION
        </p>
        <h2 id="comments-title">Leave a thought</h2>
        <p>Questions, ideas, or a little hello. Sign in with GitHub to join in.</p>
      </header>
      <div className="comments-widget">
        {Widget ? (
          <Widget
            key={term}
            id="giscus-comments"
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
          <div className="comments-status" role="status">
            <p>Comments couldn’t load. You can try again or open the discussion on GitHub.</p>
            <button className="button button-ghost" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        ) : (
          <p className="comments-status" role="status">
            {offline ? 'Comments will load once you’re back online.' : 'Loading comments…'}
          </p>
        )}
      </div>
      <a
        className="comments-link"
        href={`https://github.com/${comments.repo}/discussions?discussions_q=${encodeURIComponent(term)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open discussion on GitHub <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}
