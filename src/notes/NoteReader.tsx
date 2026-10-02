import Icon from '../components/Icon';
import ArticleHeader from '../content/ArticleHeader';
import ArticleBody from '../content/reader/ArticleBody';
import { noteSections } from '../config/sections.mjs';
import { articleUrl, listingUrl, queryFromSearch } from '../content/urls';
import type { Article, ArticleSummary } from '../content/types';
import { noteIndex } from './catalog';

export default function NoteReader({ article: note }: { article: Article }) {
  const query = queryFromSearch(window.location.search);
  const backUrl = listingUrl('notes', query);
  const backlinks = note.backlinks
    .map((slug) => noteIndex.bySlug.get(slug))
    .filter((item): item is ArticleSummary => !!item);
  return (
    <div className="journal-width reading-page">
      <a className="journal-back" href={backUrl}>
        <Icon name="arrow" />
        {query ? 'Back to results' : 'All notes'}
      </a>
      <ArticleHeader
        article={note}
        eyebrow={`KNOWLEDGE BASE / ${noteSections.byId(note.section).label}`}
        collection="notes"
      />
      <ArticleBody article={note} label="Note content" />
      <section className="note-backlinks" aria-labelledby="backlinks-title">
        <p className="eyebrow">LINKED REFERENCES</p>
        <h2 id="backlinks-title">Notes linking here</h2>
        {backlinks.length ? (
          <ul>
            {backlinks.map((item) => (
              <li key={item.slug}>
                <a className="article-title" href={articleUrl('notes', item.slug, query)}>
                  {item.title}
                  <Icon name="arrow" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No other notes link here yet.</p>
        )}
      </section>
    </div>
  );
}
