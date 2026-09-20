import './reader.css';
import { useMemo, useRef } from 'react';
import type { Article } from '../types';
import ArticleToc from './ArticleToc';
import { useArticleReader } from './useArticleReader';

export default function ArticleBody({
  article,
  label = 'Article content',
}: {
  article: Article;
  label?: string;
}) {
  const bodyRef = useRef<HTMLElement>(null);
  // Keep enhanced DOM nodes intact when the active TOC heading changes.
  const markup = useMemo(() => ({ __html: article.html }), [article.html]);
  const activeHeading = useArticleReader(bodyRef, article);

  return (
    <div className="reading-layout">
      <article
        ref={bodyRef}
        className="article-body"
        aria-label={label}
        dangerouslySetInnerHTML={markup}
      />
      <ArticleToc headings={article.headings} activeHeading={activeHeading} />
    </div>
  );
}
