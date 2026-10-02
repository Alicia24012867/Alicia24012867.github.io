import ArticleMeta from './ArticleMeta';
import ArticleTags from './ArticleTags';
import type { ArticleSummary } from './types';

/** Shared title layout, including the shell shown while a reader loads. */
export default function ArticleHeader({
  article,
  eyebrow,
  metadata = true,
  showDetails = false,
}: {
  article: ArticleSummary;
  eyebrow?: string;
  metadata?: boolean;
  showDetails?: boolean;
}) {
  return (
    <header className="reading-header">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="article-title">{article.title}</h1>
      <p className="reading-description">{article.description}</p>
      {metadata && (
        <>
          <ArticleMeta article={article} showDetails={showDetails} readingTime="estimate" />
          <ArticleTags article={article} />
        </>
      )}
    </header>
  );
}
