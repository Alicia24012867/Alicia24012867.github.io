import Icon from '../components/Icon';
import ArticleTags from '../content/ArticleTags';
import ArticleMeta from '../content/ArticleMeta';
import ArticleBody from '../content/reader/ArticleBody';
import { topicOf } from '../config/noteTopics';
import { articleUrl, listingUrl, queryFromSearch } from '../content/urls';
import type { Article, ArticleSummary } from '../content/types';
import { noteIndex } from './catalog';

export default function NoteReader({ article: note }: { article: Article }) {
  const query = queryFromSearch(window.location.search);
  const backUrl = listingUrl(query);
  const backlinks = note.backlinks
    .map((slug) => noteIndex.bySlug.get(slug))
    .filter((item): item is ArticleSummary => !!item);
  return (
    <div className="journal-width reading-page">
      <a className="journal-back" href={backUrl}>
        <Icon name="arrow" />
        {query ? 'Back to results' : 'All notes'}
      </a>
      <header className="reading-header">
        <p className="eyebrow">KNOWLEDGE BASE / {topicOf(note).label}</p>
        <h1>{note.title}</h1>
        <p className="reading-description">{note.description}</p>
        <ArticleMeta article={note} />
        <ArticleTags article={note} />
      </header>
      <ArticleBody article={note} label="Note content" />
      <section className="note-backlinks" aria-labelledby="backlinks-title">
        <p className="eyebrow">LINKED REFERENCES</p>
        <h2 id="backlinks-title">Notes linking here</h2>
        {backlinks.length ? (
          <ul>
            {backlinks.map((item) => (
              <li key={item.slug}>
                <a href={articleUrl(item.slug, query)}>
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
