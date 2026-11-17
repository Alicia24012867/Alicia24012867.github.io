import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { api, failure } from '../api/client';
import type { PageStats as Stats } from '../api/types';
import { articlePath, type Collection } from '../content/urls';

const counted = (count: number, one: string) =>
  `${count.toLocaleString('en-US')} ${one}${count === 1 ? '' : 's'}`;

/**
 * How many have read this page, and a heart to like it, at the end of its details. Opening the
 * page counts one view; the blog API counts each reader once a day.
 */
export default function PageStats({ collection, slug }: { collection: Collection; slug: string }) {
  const path = articlePath(collection, slug);
  const [stats, setStats] = useState<Stats>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setStats(undefined);
    setProblem(undefined);
    (async () => {
      // The view first, so the count the reader sees includes them.
      await api('/api/pages/view', { json: { path } }).catch(() => undefined);
      const answer = await api<Record<string, Stats>>(
        `/api/pages/stats?paths=${encodeURIComponent(path)}`,
      );
      if (!cancelled && answer[path]) setStats(answer[path]);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!stats) return null;

  const toggle = async () => {
    if (busy) return;
    const liked = !stats.liked;
    const before = stats;
    // Shown at once; put back if the API says no.
    setStats({ ...stats, liked, likes: stats.likes + (liked ? 1 : -1) });
    setBusy(true);
    setProblem(undefined);
    try {
      const answer = await api<{ likes: number; liked: boolean }>('/api/pages/like', {
        json: { path, liked },
      });
      setStats((now) => now && { ...now, ...answer });
    } catch (error) {
      setStats(before);
      setProblem(failure(error, liked ? 'like this' : 'take back your like'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <span className="article-views">{counted(stats.views, 'view')}</span>
      <span className="article-like">
        <button
          type="button"
          className={stats.liked ? 'is-active' : undefined}
          aria-pressed={stats.liked}
          aria-label={`${stats.liked ? 'Liked' : 'Like'}: ${counted(stats.likes, 'like')}`}
          title={problem}
          onClick={toggle}
        >
          <Icon name="heart" />
          {stats.likes.toLocaleString('en-US')}
        </button>
      </span>
    </>
  );
}
