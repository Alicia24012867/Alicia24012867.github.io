import ArticleMeta from './ArticleMeta';
import ArticleTags from './ArticleTags';
import type { Collection } from './urls';
import type { ArticleSummary } from './types';

/** Shared title layout, including the shell shown while a reader loads. */
export default function ArticleHeader({
  article,
  eyebrow,
  metadata = true,
  showDetails = false,
  collection = 'blog',
}: {
  article: ArticleSummary;
  eyebrow?: string;
  metadata?: boolean;
  showDetails?: boolean;
  collection?: Collection;
}) {
  return (
    <header className="reading-header">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="article-title">{article.title}</h1>
      <p className="reading-description">{article.description}</p>
      {metadata && (
        <>
          <ArticleMeta
            article={article}
            showDetails={showDetails}
            readingTime
            collection={collection}
          />
          <ArticleTags article={article} collection={collection} />
        </>
      )}
    </header>
  );
}
