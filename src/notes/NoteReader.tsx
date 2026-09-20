import Icon from '../components/Icon';
import ArticleTags from '../components/ArticleTags';
import ArticleBody from '../components/reader/ArticleBody';
import { topicOf } from '../config/noteTopics';
import { articleUrl } from '../content/urls';
import type { Article, ArticleSummary } from '../content/types';
import { noteIndex } from './catalog';

export default function NoteReader({ article: note }: { article: Article }) {
  const backlinks = note.backlinks
    .map((slug) => noteIndex.bySlug.get(slug))
    .filter((item): item is ArticleSummary => !!item);
  return (
    <div className="journal-width reading-page">
      <a className="journal-back" href="./">
        <Icon name="arrow" />
        All notes
      </a>
      <header className="reading-header">
        <p className="eyebrow">KNOWLEDGE BASE / {topicOf(note).label}</p>
        <h1>{note.title}</h1>
        <p className="reading-description">{note.description}</p>
        {note.date && (
          <p className="note-date">
            Updated <time dateTime={note.date}>{note.date}</time>
          </p>
        )}
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
                <a href={articleUrl(item.slug)}>
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
