import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { GiscusProps } from '@giscus/react';
import { comments } from '../../config/comments';
import { commentIdentity, commentTheme } from './comments';
import type { Collection } from '../urls';

/** The widget and its dependencies are fetched only near the end of the article. */
export default function ArticleComments({
  collection,
  slug,
}: {
  collection: Collection;
  slug: string;
}) {
  const container = useRef<HTMLElement>(null);
  const [Widget, setWidget] = useState<ComponentType<GiscusProps>>();
  const [failed, setFailed] = useState(false);
  const [theme, setTheme] = useState(() => commentTheme(document.documentElement.dataset.theme));
  const { term, backlink } = commentIdentity(collection, slug);

  useEffect(() => {
    let disposed = false;
    let started = false;
    setFailed(false);
    const load = () => {
      if (started) return;
      started = true;
      observer?.disconnect();
      import('@giscus/react').then(
        ({ default: Giscus }) => {
          if (!disposed) setWidget(() => Giscus);
        },
        () => {
          if (!disposed) setFailed(true);
        },
      );
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) load();
            },
            { rootMargin: '300px 0px' },
          );
    if (observer && container.current) observer.observe(container.current);
    else load();
    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const syncTheme = () => setTheme(commentTheme(document.documentElement.dataset.theme));
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'giscus:backlink';
    meta.content = backlink;
    document.head.append(meta);
    return () => meta.remove();
  }, [backlink]);

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
            Loading comments…
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
