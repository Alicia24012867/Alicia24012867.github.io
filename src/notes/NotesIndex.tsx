import { memo, useDeferredValue, useMemo } from 'react';
import type { ArticleSummary } from '../content/types';
import { useNoteSearch } from './useNoteSearch';
import Icon from '../components/Icon';
import ArticleTags from '../content/ArticleTags';
import ArticleMeta from '../content/ArticleMeta';
import { articleUrl } from '../content/urls';
import { useListingQuery } from '../hooks/useListingQuery';
import { noteIndex, noteTopics } from './catalog';

const noteCount = (count: number) => `${count} ${count === 1 ? 'note' : 'notes'}`;

function NoteEntry({
  note,
  onTag,
  query,
}: {
  note: ArticleSummary;
  onTag: (tag: string) => void;
  query: string;
}) {
  return (
    <article className="note-entry">
      <div>
        <h3 className="article-title">
          <a href={articleUrl('notes', note.slug, query)}>{note.title}</a>
        </h3>
        <p>{note.description}</p>
        <ArticleMeta article={note} />
        <ArticleTags article={note} onTag={onTag} />
      </div>
      <a
        className="journal-read"
        href={articleUrl('notes', note.slug, query)}
        aria-label={`Read: ${note.title}`}
      >
        <Icon name="arrow" />
      </a>
    </article>
  );
}

const NoteEntries = memo(function NoteEntries({
  entries,
  onTag,
  query,
}: {
  entries: ArticleSummary[];
  onTag: (tag: string) => void;
  query: string;
}) {
  return entries.map((note) => (
    <NoteEntry note={note} onTag={onTag} query={query} key={note.slug} />
  ));
});

export default function NotesIndex() {
  const { query, setQuery } = useListingQuery();
  const deferredQuery = useDeferredValue(query);
  const { index, pending, failed, retry } = useNoteSearch(deferredQuery);
  const shelves = useMemo(() => {
    const groups = pending || failed ? index.groups : index.filter(deferredQuery);
    return noteTopics.flatMap((topic) => {
      const entries = groups.get(topic.id);
      return entries?.length ? [{ topic, entries }] : [];
    });
  }, [index, deferredQuery, pending, failed]);
  const count = shelves.reduce((total, { entries }) => total + entries.length, 0);
  const searching = !!deferredQuery.trim();

  return (
    <>
      <section className="journal-hero">
        <div className="journal-width">
          <p className="eyebrow">NOTES / KNOWLEDGE BASE</p>
          <h1>
            Connecting the pieces<span>.</span>
          </h1>
          <p className="journal-description">
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
        {shelves.length > 0 && (
          <nav className="note-topics" aria-label="Knowledge topics">
            {shelves.map(({ topic, entries }) => (
              <a key={topic.id} href={topic.href}>
                <strong>{topic.label}</strong>
                {topic.description && <span>{topic.description}</span>}
                <small>{noteCount(entries.length)} ↗</small>
              </a>
            ))}
          </nav>
        )}
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
          {!pending && !failed && count === 0 && (
            <div className="journal-empty">
              <h3>{searching ? 'No matching notes' : 'No notes yet'}</h3>
              <p>
                {searching
                  ? 'Try another keyword or clear your search.'
                  : 'Room for the next discovery.'}
              </p>
              {searching && (
                <button className="button button-primary" onClick={() => setQuery('')}>
                  View all notes
                </button>
              )}
            </div>
          )}
          {!pending &&
            !failed &&
            shelves.map(({ topic, entries }) => (
              <section
                className="journal-shelf"
                id={topic.anchorId}
                key={topic.id}
                aria-labelledby={`title-${topic.anchorId}`}
              >
                <div className="journal-shelf-heading">
                  <h3 id={`title-${topic.anchorId}`}>
                    {topic.label}
                    <span className="article-count">{entries.length}</span>
                  </h3>
                  {topic.description && <p>{topic.description}</p>}
                </div>
                <NoteEntries entries={entries} onTag={setQuery} query={deferredQuery} />
              </section>
            ))}
        </div>
      </div>
    </>
  );
}
