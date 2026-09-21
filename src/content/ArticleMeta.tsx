import { profile } from '../config/profile';
import { articleSectionById } from '../config/sections.mjs';
import type { ArticleSummary } from './types';

export default function ArticleMeta({
  article,
  showDetails = false,
  readingTime = showDetails ? 'compact' : false,
}: {
  article: ArticleSummary;
  showDetails?: boolean;
  readingTime?: 'compact' | 'estimate' | false;
}) {
  const section = showDetails ? articleSectionById(article.section) : undefined;
  return (
    <div className="article-meta">
      {section && (
        <>
          <a className="article-section-mark" href={`./#section-${section.id}`}>
            {section.label}
          </a>
          <span className="meta-dot">·</span>
          <span>{profile.name}</span>
          <span className="meta-dot">·</span>
        </>
      )}
      <span className="article-date">
        Posted on{' '}
        <time dateTime={article.date} title={article.date}>
          {article.date.slice(0, 10)}
        </time>
      </span>
      {readingTime && (
        <>
          <span className="meta-dot">·</span>
          <span className="reading-time">
            {readingTime === 'estimate'
              ? `About ${article.readingMinutes} ${article.readingMinutes === 1 ? "minute's" : "minutes'"} read`
              : `${article.readingMinutes} min read`}
          </span>
        </>
      )}
      {article.updated && (
        <>
          <span className="meta-dot">·</span>
          <span className="article-date">
            Edited on{' '}
            <time dateTime={article.updated} title={article.updated}>
              {article.updated.slice(0, 10)}
            </time>
          </span>
        </>
      )}
    </div>
  );
}
