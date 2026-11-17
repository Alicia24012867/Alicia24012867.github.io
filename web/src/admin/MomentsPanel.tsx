import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Icon from '../components/Icon';
import { api, failure } from '../api/client';
import { useMe } from '../api/me';
import type { Moment } from '../api/types';
import { cleanHtml } from '../comments/clean';
import { Status, useLoad, when } from './shared';

type Page = { moments: Moment[]; next: string | null };
type Picked = { file: File; preview: string; alt: string };

const maxPhotos = 9;

/** Who sees a moment: everyone, or one group, by the name the sign-in service gives it. */
function AudienceField({ defaultValue = 'public' }: { defaultValue?: string }) {
  const { user } = useMe();
  const id = useId();
  const suggested = new Set(['public', 'friends', 'family', ...(user?.groups ?? []), defaultValue]);
  suggested.delete('admin');
  return (
    <label className="admin-field admin-inline">
      <span>Who sees it</span>
      <input
        name="audience"
        list={id}
        required
        defaultValue={defaultValue}
        pattern="[a-z][a-z0-9\-]{0,31}"
        title="public, or a group such as friends"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <datalist id={id}>
        {[...suggested].map((audience) => (
          <option key={audience} value={audience} />
        ))}
      </datalist>
    </label>
  );
}

/** A moment with up to nine photos, written on the phone; the newest show on the Moments page. */
export default function MomentsPanel() {
  const load = useCallback(() => api<Page>('/api/moments?limit=20'), []);
  const { value: page, setValue: setPage, error } = useLoad(load);
  const [problem, setProblem] = useState<string>();

  const more = async () => {
    if (!page?.next) return;
    try {
      const next = await api<Page>(`/api/moments?limit=20&before=${encodeURIComponent(page.next)}`);
      setPage({ moments: [...page.moments, ...next.moments], next: next.next });
    } catch (failed) {
      setProblem(failure(failed, 'load more'));
    }
  };

  const remove = async (moment: Moment) => {
    if (!window.confirm('Delete this moment and its photos? This can’t be undone.')) return;
    setProblem(undefined);
    try {
      await api(`/api/admin/moments/${moment.id}`, { method: 'DELETE' });
      setPage(
        (page) => page && { ...page, moments: page.moments.filter((m) => m.id !== moment.id) },
      );
    } catch (failed) {
      setProblem(failure(failed, 'delete it'));
    }
  };

  const changed = (moment: Moment) =>
    setPage(
      (page) =>
        page && { ...page, moments: page.moments.map((m) => (m.id === moment.id ? moment : m)) },
    );

  return (
    <section className="admin-panel" aria-labelledby="moments-heading">
      <h1 id="moments-heading">Moments</h1>
      <NewMoment
        onPosted={(moment) =>
          setPage((page) => page && { ...page, moments: [moment, ...page.moments] })
        }
      />
      <h2 className="admin-subhead">Posted</h2>
      <Status error={error ?? problem} loading={!page && !error} />
      {page && !page.moments.length && <p className="admin-note">No moments yet.</p>}
      <ol className="admin-list">
        {page?.moments.map((moment) => (
          <li key={moment.id} className="admin-card">
            <MomentCard moment={moment} onChanged={changed} onDelete={() => remove(moment)} />
          </li>
        ))}
      </ol>
      {page?.next && (
        <button className="button button-ghost" type="button" onClick={more}>
          Earlier
        </button>
      )}
    </section>
  );
}

function NewMoment({ onPosted }: { onPosted: (moment: Moment) => void }) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState<{ text: string; wrong?: boolean }>();

  // Previews are object URLs, let go once their photo is removed or posted.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const kept = previews.current;
    return () => kept.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  const letGo = (photos: Picked[]) =>
    photos.forEach(({ preview }) => {
      URL.revokeObjectURL(preview);
      previews.current.delete(preview);
    });

  const pick = (files: FileList | null) => {
    if (!files) return;
    const room = maxPhotos - picked.length;
    const added = [...files].slice(0, room).map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return { file, preview, alt: '' };
    });
    if (files.length > room) setSaid({ text: `At most ${maxPhotos} photos.`, wrong: true });
    setPicked((list) => [...list, ...added]);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = String(data.get('text') ?? '').trim();
    if (!text && !picked.length) {
      setSaid({ text: 'Write something or add a photo.', wrong: true });
      return;
    }
    const body = new FormData();
    body.set('text', text);
    body.set('audience', String(data.get('audience') || 'public'));
    for (const photo of picked) {
      body.append('photos', photo.file);
      body.append('alts', photo.alt.trim());
    }
    setSending(true);
    setSaid(undefined);
    try {
      const moment = await api<Moment>('/api/admin/moments', { body });
      form.reset();
      letGo(picked);
      setPicked([]);
      onPosted(moment);
      setSaid({ text: 'Posted.' });
    } catch (failed) {
      setSaid({ text: failure(failed, 'post it'), wrong: true });
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="admin-form" onSubmit={submit}>
      <label className="admin-field">
        <span>What happened?</span>
        <textarea name="text" rows={4} maxLength={2000} readOnly={sending} />
      </label>
      {picked.length > 0 && (
        <ul className="admin-picked">
          {picked.map((photo, index) => (
            <li key={photo.preview}>
              <img src={photo.preview} alt="" />
              <input
                aria-label={`Describe photo ${index + 1}`}
                placeholder="Describe it (optional)"
                maxLength={300}
                value={photo.alt}
                onChange={(event) =>
                  setPicked((list) =>
                    list.map((each, at) =>
                      at === index ? { ...each, alt: event.target.value } : each,
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label={`Remove photo ${index + 1}`}
                onClick={() => {
                  letGo([photo]);
                  setPicked((list) => list.filter((_, at) => at !== index));
                }}
              >
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="admin-row">
        <label className="button button-ghost admin-file">
          <Icon name="image" />
          Add photos
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={sending || picked.length >= maxPhotos}
            onChange={(event) => {
              pick(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
        <AudienceField />
        <button className="button button-primary" type="submit" disabled={sending}>
          <Icon name="sparkles" />
          {sending ? 'Posting…' : 'Post'}
        </button>
      </div>
      {said && (
        <p className={`admin-note${said.wrong ? ' is-wrong' : ''}`} role="status">
          {said.text}
        </p>
      )}
    </form>
  );
}

function MomentCard({
  moment,
  onChanged,
  onDelete,
}: {
  moment: Moment;
  onChanged: (moment: Moment) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string>();

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      onChanged(
        await api<Moment>(`/api/admin/moments/${moment.id}`, {
          method: 'PATCH',
          json: { text: String(data.get('text') ?? ''), audience: String(data.get('audience')) },
        }),
      );
      setEditing(false);
      setProblem(undefined);
    } catch (failed) {
      setProblem(failure(failed, 'save it'));
    }
  };

  return (
    <>
      <header className="admin-card-head">
        <strong>{when(moment.createdAt)}</strong>
        <span className="admin-chip">
          {moment.audience === 'public' ? 'everyone' : moment.audience}
        </span>
      </header>
      {editing ? (
        <form className="admin-form" onSubmit={save}>
          <label className="admin-field">
            <span>Text</span>
            <textarea name="text" rows={4} maxLength={2000} defaultValue={moment.text} />
          </label>
          <div className="admin-row">
            <AudienceField defaultValue={moment.audience} />
            <button className="button button-primary" type="submit">
              Save
            </button>
            <button className="button button-ghost" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        moment.html && (
          <div
            className="admin-body"
            dangerouslySetInnerHTML={{ __html: cleanHtml(moment.html) }}
          />
        )
      )}
      {moment.photos.length > 0 && (
        <div className="admin-thumbs">
          {moment.photos.map((photo) => (
            <a key={photo.url} href={photo.url} target="_blank" rel="noopener">
              <img src={photo.thumbnail.url} alt={photo.alt} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {problem && (
        <p className="admin-note is-wrong" role="alert">
          {problem}
        </p>
      )}
      {!editing && (
        <div className="admin-actions">
          <button className="button button-ghost" type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="admin-danger" type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      )}
    </>
  );
}
