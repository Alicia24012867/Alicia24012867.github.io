import './comments.css';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Icon from '../components/Icon';
import { api, failure, signInUrl } from '../api/client';
import { signOut, useMe } from '../api/me';
import type { Comment, CommentStatus } from '../api/types';
import { cleanHtml } from './clean';

type Shown = Comment & { waiting?: boolean };
type Words = {
  /** comment, or note for the guestbook */
  noun: string;
  /** The button that sends one. */
  send: string;
  placeholder: string;
  empty: string;
};

// A reader who isn't signed in writes their name once; it fills the form next time.
const remembered = 'alicia-comment-author';
function rememberedAuthor(): { name: string; email: string } {
  try {
    const kept = JSON.parse(localStorage.getItem(remembered) ?? '{}');
    return { name: String(kept.name ?? ''), email: String(kept.email ?? '') };
  } catch {
    return { name: '', email: '' };
  }
}
function remember(name: string, email: string) {
  try {
    localStorage.setItem(remembered, JSON.stringify({ name, email }));
  } catch {
    // Without storage, the form just asks again.
  }
}

const when = (time: string) => time.slice(0, 10);

/**
 * The comments of one page, or the guestbook, from the blog API: the newest form on top, then
 * what readers wrote, oldest first, each with its replies. A signed-in reader's words show at
 * once; anyone else's wait until I've read them.
 */
export default function CommentThread({
  thread,
  words,
  back,
}: {
  /** A page path, or `guestbook`. */
  thread: string;
  words: Words;
  /** Where signing in comes back to: this part of the page. */
  back: string;
}) {
  const [comments, setComments] = useState<Shown[]>();
  const [failed, setFailed] = useState(false);
  const [replying, setReplying] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    api<{ comments: Comment[] }>(`/api/comments?thread=${encodeURIComponent(thread)}`).then(
      ({ comments }) => {
        if (!cancelled) setComments(comments);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [thread]);

  const { tops, replies } = useMemo(() => {
    const replies = new Map<string, Shown[]>();
    const tops: Shown[] = [];
    for (const comment of comments ?? []) {
      if (!comment.parentId) tops.push(comment);
      else replies.set(comment.parentId, [...(replies.get(comment.parentId) ?? []), comment]);
    }
    return { tops, replies };
  }, [comments]);

  const posted = (comment: Comment, status: CommentStatus) => {
    setComments((shown) => [...(shown ?? []), { ...comment, waiting: status !== 'published' }]);
    setReplying(undefined);
  };

  if (failed)
    return (
      <div className="comments-status" role="status">
        <p>The {words.noun}s couldn’t load. Please try again.</p>
        <button className="button button-ghost" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!comments)
    return (
      <p className="comments-status" role="status">
        Loading {words.noun}s…
      </p>
    );

  const count = comments.filter((comment) => !comment.waiting).length;
  return (
    <div className="thread">
      <CommentForm thread={thread} words={words} back={back} onPosted={posted} />
      <p className="thread-count">
        {count ? `${count} ${words.noun}${count === 1 ? '' : 's'}` : words.empty}
      </p>
      {tops.length > 0 && (
        <ol className="thread-list">
          {tops.map((top) => (
            <li key={top.id} className="thread-item">
              <CommentView comment={top} onReply={() => setReplying(top.id)} />
              {(replies.get(top.id)?.length || replying === top.id) && (
                <ol className="thread-replies">
                  {replies.get(top.id)?.map((reply) => (
                    <li key={reply.id} className="thread-item">
                      <CommentView comment={reply} onReply={() => setReplying(top.id)} />
                    </li>
                  ))}
                  {replying === top.id && (
                    <li className="thread-item">
                      <CommentForm
                        thread={thread}
                        words={{
                          ...words,
                          send: 'Reply',
                          placeholder: `Reply to ${top.author.name}…`,
                        }}
                        back={back}
                        parentId={top.id}
                        onPosted={posted}
                        onCancel={() => setReplying(undefined)}
                      />
                    </li>
                  )}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function CommentView({ comment, onReply }: { comment: Shown; onReply: () => void }) {
  const html = useMemo(() => cleanHtml(comment.html), [comment.html]);
  return (
    <article className={`thread-comment${comment.waiting ? ' is-waiting' : ''}`}>
      <header>
        <strong className="thread-author">{comment.author.name}</strong>
        {comment.author.signedIn && (
          <span className="thread-badge" title="Signed in">
            <Icon name="check" />
            <span className="thread-hidden">Signed in</span>
          </span>
        )}
        <time dateTime={comment.createdAt} title={comment.createdAt}>
          {when(comment.createdAt)}
        </time>
      </header>
      <div className="thread-body" dangerouslySetInnerHTML={{ __html: html }} />
      {comment.waiting ? (
        <p className="thread-note">Only you can see this until I’ve read it.</p>
      ) : (
        <button className="thread-reply" type="button" onClick={onReply}>
          Reply
        </button>
      )}
    </article>
  );
}

function CommentForm({
  thread,
  words,
  back,
  parentId,
  onPosted,
  onCancel,
}: {
  thread: string;
  words: Words;
  back: string;
  parentId?: string;
  onPosted: (comment: Comment, status: CommentStatus) => void;
  onCancel?: () => void;
}) {
  const { user, loading } = useMe();
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState<{ text: string; wrong?: boolean }>();
  const [author, setAuthor] = useState(rememberedAuthor);
  const body = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (parentId) body.current?.focus();
  }, [parentId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = String(data.get('body') ?? '').trim();
    if (!text) return;
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    setSending(true);
    setSaid(undefined);
    try {
      const created = await api<{ comment: Comment; status: CommentStatus }>('/api/comments', {
        json: {
          thread,
          body: text,
          ...(parentId && { parentId }),
          ...(!user && { name, ...(email && { email }) }),
          website: String(data.get('website') ?? ''),
        },
      });
      form.reset();
      // The next comment starts with the same name and email.
      if (!user) {
        remember(name, email);
        setAuthor({ name, email });
      }
      onPosted(created.comment, created.status);
      setSaid({
        text:
          created.status === 'published'
            ? `Thank you! Your ${words.noun} is up.`
            : `Thank you! Your ${words.noun} will appear once I’ve read it.`,
      });
    } catch (error) {
      setSaid({ text: failure(error, `post your ${words.noun}`), wrong: true });
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="thread-form" onSubmit={submit}>
      <label className="thread-field">
        <span className="thread-hidden">Your {words.noun}</span>
        <textarea
          ref={body}
          name="body"
          rows={parentId ? 3 : 4}
          maxLength={4000}
          required
          placeholder={words.placeholder}
          readOnly={sending}
        />
      </label>
      {!loading && !user && (
        <div className="thread-author-fields">
          <label className="thread-field">
            <span>Name</span>
            <input
              name="name"
              maxLength={40}
              required
              defaultValue={author.name}
              autoComplete="name"
            />
          </label>
          <label className="thread-field">
            <span>
              Email <em>optional, only I see it</em>
            </span>
            <input
              name="email"
              type="email"
              maxLength={200}
              defaultValue={author.email}
              autoComplete="email"
            />
          </label>
        </div>
      )}
      {/* For bots only: people never see it, so anything in it gives a bot away. */}
      <input
        className="thread-trap"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <div className="thread-actions">
        <button className="button button-primary" type="submit" disabled={sending}>
          <Icon name="pen" />
          {sending ? 'Sending…' : words.send}
        </button>
        {onCancel && (
          <button className="button button-ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        {!loading && (
          <p className="thread-who">
            {user ? (
              <>
                Writing as <strong>{user.name}</strong> ·{' '}
                <button type="button" onClick={() => void signOut()}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                Or <a href={signInUrl(back)}>sign in</a> to post right away.
              </>
            )}
          </p>
        )}
      </div>
      {said && (
        <p className={`thread-said${said.wrong ? ' is-wrong' : ''}`} role="status">
          {said.text}
        </p>
      )}
      {!parentId && (
        <p className="thread-hint">
          Markdown works: **bold**, _italic_, `code` and [links](https://…).
        </p>
      )}
    </form>
  );
}
