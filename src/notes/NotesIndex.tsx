import { memo, useDeferredValue, useMemo } from 'react';
import type { ArticleSummary } from '../content/types';
import { useNoteSearch } from './useNoteSearch';
import Icon from '../components/Icon';
import ArticleTags from '../components/ArticleTags';
import { noteTopics } from '../config/noteTopics';
import { articleUrl } from '../content/urls';
import { useSearchQuery } from '../hooks/useSearchQuery';
import { noteIndex } from './catalog';

const noteCount = (count: number) => `${count} ${count === 1 ? 'note' : 'notes'}`;
const visibleTopics = noteTopics.filter(
  (topic) => topic.id !== 'other' || noteIndex.groups.has(topic.id),
);

const NoteEntry = memo(function NoteEntry({
  note,
  onTag,
}: {
  note: ArticleSummary;
  onTag: (tag: string) => void;
}) {
  return (
    <article className="note-entry">
      <div>
        <h3>
          <a href={articleUrl(note.slug)}>{note.title}</a>
        </h3>
        <p>{note.description}</p>
        <ArticleTags article={note} onTag={onTag} />
      </div>
      <a className="journal-read" href={articleUrl(note.slug)} aria-label={`Read: ${note.title}`}>
        <Icon name="arrow" />
      </a>
    </article>
  );
});

export default function NotesIndex() {
  const [query, setQuery] = useSearchQuery();
  const deferredQuery = useDeferredValue(query);
  const { index, pending, failed, retry } = useNoteSearch(deferredQuery);
  const groups = useMemo(() => index.filter(deferredQuery), [index, deferredQuery]);
  const count = [...groups.values()].reduce((total, entries) => total + entries.length, 0);
  const searching = !!deferredQuery.trim();

  return (
    <>
      <section className="journal-hero">
        <div className="journal-width">
          <p className="eyebrow">NOTES / KNOWLEDGE BASE</p>
          <h1>
            Connecting the pieces<span>.</span>
          </h1>
          <p>
            Formulas, source code, APIs, and algorithms. Learn, record, revisit.
            <br />
            The blog holds complete stories. These notes keep knowledge close at hand.
          </p>
          <div className="journal-hero-note">
            <span>✧</span> A personal wiki, always growing.
          </div>
        </div>
      </section>
      <div className="journal-width journal-list-section">
        <div className="journal-list-heading">
          <div>
            <p className="eyebrow">BROWSE THE WIKI</p>
            <h2>
              Knowledge index<span className="article-count">{noteIndex.bySlug.size}</span>
            </h2>
          </div>
          <label className="article-search">
            <span className="visually-hidden">Search note titles, content, or tags</span>
            <Icon name="code" />
            <input
              type="search"
              placeholder="Search formulas, APIs, keywords…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <nav className="note-topics" aria-label="Knowledge topics">
          {visibleTopics.map((topic) => (
            <a key={topic.id} href={`./#topic-${topic.id}`}>
              <strong>{topic.label}</strong>
              <span>{topic.description}</span>
              <small>{noteCount(noteIndex.groups.get(topic.id)?.length ?? 0)} ↗</small>
            </a>
          ))}
        </nav>
        <div aria-live="polite" aria-busy={pending || query !== deferredQuery}>
          <p className="note-results">
            {pending
              ? 'Searching…'
              : failed
                ? 'Search could not be loaded.'
                : searching
                  ? `${noteCount(count)} found`
                  : 'Organized by topic · Always evolving'}
          </p>
          {failed && (
            <button className="button button-primary" onClick={retry}>
              Reload search
            </button>
          )}
          {!pending && !failed && count === 0 && searching && (
            <div className="journal-empty">
              <h3>No matching notes</h3>
              <p>Try another keyword or clear your search.</p>
              <button className="button button-primary" onClick={() => setQuery('')}>
                View all notes
              </button>
            </div>
          )}
          {!pending &&
            !failed &&
            visibleTopics.map((topic) => {
              const entries = groups.get(topic.id) ?? [];
              if (searching && !entries.length) return null;
              return (
                <section
                  className="journal-shelf"
                  id={`topic-${topic.id}`}
                  key={topic.id}
                  aria-labelledby={`topic-title-${topic.id}`}
                >
                  <div className="journal-shelf-heading">
                    <h3 id={`topic-title-${topic.id}`}>
                      {topic.label}
                      <span className="article-count">{entries.length}</span>
                    </h3>
                    <p>{topic.description}</p>
                  </div>
                  {entries.length ? (
                    entries.map((note) => (
                      <NoteEntry note={note} onTag={setQuery} key={note.slug} />
                    ))
                  ) : (
                    <div className="journal-shelf-empty">
                      <p>No notes yet. Room for the next discovery.</p>
                    </div>
                  )}
                </section>
              );
            })}
        </div>
      </div>
    </>
  );
}
