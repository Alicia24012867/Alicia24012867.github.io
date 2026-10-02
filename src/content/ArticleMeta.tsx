import { blogSections } from '../config/sections.mjs';
import { collectionBase, type Collection } from './urls';
import type { ArticleSummary } from './types';

export default function ArticleMeta({
  article,
  showDetails = false,
  readingTime = showDetails,
  collection = 'blog',
}: {
  article: ArticleSummary;
  showDetails?: boolean;
  readingTime?: boolean;
  collection?: Collection;
}) {
  const section = showDetails ? blogSections.byId(article.section) : undefined;
  return (
    <div className="article-meta">
      {section && (
        <a className="article-section-mark" href={collectionBase[collection] + section.href}>
          {section.label}
        </a>
      )}
      {article.author && <span className="article-author">{article.author}</span>}
      {article.email && (
        <a className="article-email" href={'mailto:' + encodeURIComponent(article.email)}>
          {article.email}
        </a>
      )}
      <span className="article-date">
        Posted on{' '}
        <time dateTime={article.date} title={article.date}>
          {article.date.slice(0, 10)}
        </time>
      </span>
      {readingTime && (
        <>
          <span className="article-word-count">
            {article.wordCount.toLocaleString('en-US')} {article.wordCount === 1 ? 'word' : 'words'}
          </span>
          <span className="reading-time">{article.readingMinutes} min read</span>
        </>
      )}
      {article.updated && (
        <span className="article-date">
          Edited on{' '}
          <time dateTime={article.updated} title={article.updated}>
            {article.updated.slice(0, 10)}
          </time>
        </span>
      )}
    </div>
  );
}
