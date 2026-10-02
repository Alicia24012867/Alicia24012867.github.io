import './reader.css';
import { useMemo, useRef } from 'react';
import type { Article } from '../types';
import ArticleToc from './ArticleToc';
import HandwrittenSignature from '../../components/signature/HandwrittenSignature';
import { useArticleReader } from './useArticleReader';

export default function ArticleBody({
  article,
  label = 'Article content',
}: {
  article: Article;
  label?: string;
}) {
  const bodyRef = useRef<HTMLElement>(null);
  // Keep enhanced DOM nodes intact if the parent renders again.
  const markup = useMemo(() => ({ __html: article.html }), [article.html]);
  useArticleReader(bodyRef, article);

  return (
    <div className="reading-layout">
      <div className="reading-content">
        <article
          ref={bodyRef}
          className="article-body"
          aria-label={label}
          dangerouslySetInnerHTML={markup}
        />
        <HandwrittenSignature />
      </div>
      <ArticleToc headings={article.headings} bodyRef={bodyRef} />
    </div>
  );
}
