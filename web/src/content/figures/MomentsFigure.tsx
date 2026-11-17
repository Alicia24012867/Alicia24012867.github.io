import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Moment } from '../../api/types';
import { features } from '../../config/features';
import { cleanHtml } from '../../comments/clean';

const day = (time: string) =>
  new Date(time).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * Moments posted from my phone, newest first, in the same shape as the ones written into the
 * post: a date, a few words and a gallery. Photos open in the article's photo viewer.
 */
export default function MomentsFigure() {
  const [moments, setMoments] = useState<Moment[]>();
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');

  const load = useCallback(async (before?: string) => {
    setState('loading');
    try {
      const page = await api<{ moments: Moment[]; next: string | null }>(
        `/api/moments?limit=10${before ? `&before=${encodeURIComponent(before)}` : ''}`,
      );
      setMoments((shown) => [...(before ? (shown ?? []) : []), ...page.moments]);
      setNext(page.next);
      setState('idle');
    } catch {
      setState('failed');
    }
  }, []);

  useEffect(() => {
    if (features.moments) void load();
  }, [load]);

  if (!features.moments) return null;
  if (!moments)
    return (
      <p className="figure-status" role="status">
        {state === 'failed' ? 'The latest moments couldn’t load.' : 'Loading the latest moments…'}
      </p>
    );

  return (
    <div className="moments">
      {moments.map((moment) => (
        <article key={moment.id} className="moment">
          <p className="moment-date">
            <time dateTime={moment.createdAt}>{day(moment.createdAt)}</time>
          </p>
          {moment.html && (
            <div
              className="moment-text"
              dangerouslySetInnerHTML={{ __html: cleanHtml(moment.html) }}
            />
          )}
          {moment.photos.length > 0 && (
            <div className={moment.photos.length > 1 ? 'article-gallery' : 'moment-single'}>
              {moment.photos.map((photo) => (
                <figure key={photo.url}>
                  <a href={photo.url} data-photo="" aria-label="View the photo at full size">
                    <img
                      src={photo.thumbnail.url}
                      alt={photo.alt}
                      width={photo.thumbnail.width}
                      height={photo.thumbnail.height}
                      loading="lazy"
                    />
                  </a>
                  {photo.alt && <figcaption>{photo.alt}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </article>
      ))}
      {next && (
        <button
          className="button button-ghost moments-more"
          type="button"
          disabled={state === 'loading'}
          onClick={() => void load(next)}
        >
          {state === 'loading' ? 'Loading…' : 'Earlier moments'}
        </button>
      )}
      {state === 'failed' && (
        <p className="figure-status" role="status">
          Couldn’t load more. Please try again.
        </p>
      )}
    </div>
  );
}
