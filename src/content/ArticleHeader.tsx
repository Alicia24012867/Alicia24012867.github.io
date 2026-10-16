import type { ReactNode } from 'react';
import ArticleMeta from './ArticleMeta';
import ArticleTags from './ArticleTags';
import { textLanguage } from './language.mjs';
import type { Collection } from './urls';
import type { ArticleSummary } from './types';

/** Shared title layout, including the shell shown while a reader loads. */
export default function ArticleHeader({
  article,
  eyebrow,
  metadata = true,
  showDetails = false,
  collection = 'blog',
  actions,
}: {
  article: ArticleSummary;
  eyebrow?: string;
  metadata?: boolean;
  showDetails?: boolean;
  collection?: Collection;
  /** Controls for the open document, placed at the end of its details. */
  actions?: ReactNode;
}) {
  return (
    <header className="reading-header">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="article-title" lang={textLanguage(article.title)}>
        {article.title}
      </h1>
      <p className="reading-description" lang={textLanguage(article.description)}>
        {article.description}
      </p>
      {metadata && (
        <>
          <ArticleMeta
            article={article}
            showDetails={showDetails}
            readingTime
            collection={collection}
          >
            {actions}
          </ArticleMeta>
          <ArticleTags article={article} collection={collection} />
        </>
      )}
    </header>
  );
}
