import { profile } from '../config/profile';
import type { ArticleSummary } from '../content/types';
import { articleSectionById } from '../config/sections.mjs';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});
const displayDate = (date: string) => dateFormat.format(new Date(`${date}T00:00:00Z`));

export function ArticleMeta({ article }: { article: ArticleSummary }) {
  const section = articleSectionById(article.section);
  return (
    <div className="article-meta">
      <a className="article-section-mark" href={`./#section-${section.id}`}>
        {section.label}
      </a>
      <span className="meta-dot">·</span>
      <span>{profile.name}</span>
      <span className="meta-dot">·</span>
      {article.date && (
        <>
          <time dateTime={article.date}>{displayDate(article.date)}</time>
          <span className="meta-dot">·</span>
        </>
      )}
      <span>{article.readingMinutes} min read</span>
    </div>
  );
}
