import { useCallback, useState } from 'react';
import { api, failure } from '../api/client';
import type { AdminComment, CommentStatus } from '../api/types';
import { cleanHtml } from '../comments/clean';
import { Status, useLoad, when } from './shared';

type Page = { comments: AdminComment[]; next: string | null };
const filters = [
  { status: 'pending', label: 'Waiting' },
  { status: 'published', label: 'Published' },
  { status: 'hidden', label: 'Hidden' },
  { status: '', label: 'All' },
] as const;

const threadLink = (thread: string) =>
  thread === 'guestbook' ? '/#guestbook' : `${thread}#comments`;

/** Comments from readers who weren't signed in wait here until they're published. */
export default function CommentsPanel() {
  const [status, setStatus] = useState<CommentStatus | ''>('pending');
  const [problem, setProblem] = useState<string>();
  const load = useCallback(
    () => api<Page>(`/api/admin/comments${status ? `?status=${status}` : ''}`),
    [status],
  );
  const { value: page, setValue: setPage, error } = useLoad(load);

  const more = async () => {
    if (!page?.next) return;
    try {
      const next = await api<Page>(
        `/api/admin/comments?cursor=${encodeURIComponent(page.next)}${status ? `&status=${status}` : ''}`,
      );
      setPage({ comments: [...page.comments, ...next.comments], next: next.next });
    } catch (failed) {
      setProblem(failure(failed, 'load more'));
    }
  };

  const change = async (comment: AdminComment, to: 'published' | 'hidden') => {
    setProblem(undefined);
    try {
      const changed = await api<AdminComment>(`/api/admin/comments/${comment.id}`, {
        method: 'PATCH',
        json: { status: to },
      });
      setPage(
        (page) =>
          page && {
            ...page,
            comments: page.comments.flatMap((each) =>
              each.id !== comment.id ? [each] : status && status !== to ? [] : [changed],
            ),
          },
      );
    } catch (failed) {
      setProblem(failure(failed, 'change it'));
    }
  };

  const remove = async (comment: AdminComment) => {
    const replies = comment.parentId ? '' : ' Its replies go too.';
    if (!window.confirm(`Delete this comment by ${comment.author.name}?${replies}`)) return;
    setProblem(undefined);
    try {
      await api(`/api/admin/comments/${comment.id}`, { method: 'DELETE' });
      setPage(
        (page) =>
          page && {
            ...page,
            comments: page.comments.filter(
              (each) => each.id !== comment.id && each.parentId !== comment.id,
            ),
          },
      );
    } catch (failed) {
      setProblem(failure(failed, 'delete it'));
    }
  };

  return (
    <section className="admin-panel" aria-labelledby="comments-heading">
      <h1 id="comments-heading">Comments</h1>
      <div className="admin-filters" role="group" aria-label="Show">
        {filters.map((filter) => (
          <button
            key={filter.label}
            type="button"
            className={status === filter.status ? 'is-active' : undefined}
            aria-pressed={status === filter.status}
            onClick={() => setStatus(filter.status)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <Status error={error ?? problem} loading={!page && !error} />
      {page && !page.comments.length && <p className="admin-note">Nothing here.</p>}
      <ol className="admin-list">
        {page?.comments.map((comment) => (
          <li key={comment.id} className="admin-card">
            <header className="admin-card-head">
              <strong>{comment.author.name}</strong>
              {comment.author.signedIn && <span className="admin-chip">signed in</span>}
              {comment.email && <a href={`mailto:${comment.email}`}>{comment.email}</a>}
              <span className={`admin-chip is-${comment.status}`}>{comment.status}</span>
            </header>
            <p className="admin-meta">
              <a href={threadLink(comment.thread)}>
                {comment.thread === 'guestbook' ? 'Guestbook' : comment.thread}
              </a>
              {comment.parentId && ' · a reply'} · {when(comment.createdAt)}
            </p>
            <div
              className="admin-body"
              dangerouslySetInnerHTML={{ __html: cleanHtml(comment.html) }}
            />
            <div className="admin-actions">
              {comment.status !== 'published' && (
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => change(comment, 'published')}
                >
                  Publish
                </button>
              )}
              {comment.status !== 'hidden' && (
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => change(comment, 'hidden')}
                >
                  Hide
                </button>
              )}
              <button className="admin-danger" type="button" onClick={() => remove(comment)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ol>
      {page?.next && (
        <button className="button button-ghost" type="button" onClick={more}>
          More
        </button>
      )}
    </section>
  );
}
