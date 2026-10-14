import './reader.css';
import { useMemo, useRef } from 'react';
import type { Article } from '../types';
import ArticleFigures from './ArticleFigures';
import ArticleToc from './ArticleToc';
import FootnotePreview from './FootnotePreview';
import LinkPreview, { type LinkPreviewSource } from './LinkPreview';
import HandwrittenSignature from '../../components/signature/HandwrittenSignature';
import PhotoViewer from './PhotoViewer';
import ReadingProgress from './ReadingProgress';
import { useArticleReader } from './useArticleReader';

export default function ArticleBody({
  article,
  label = 'Article content',
  previews,
}: {
  article: Article;
  label?: string;
  /** Other documents whose links show a preview card. */
  previews?: LinkPreviewSource;
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
      <ArticleFigures key={article.slug} bodyRef={bodyRef} />
      <FootnotePreview bodyRef={bodyRef} slug={article.slug} />
      {previews && <LinkPreview bodyRef={bodyRef} slug={article.slug} source={previews} />}
      <PhotoViewer bodyRef={bodyRef} slug={article.slug} />
      <ReadingProgress bodyRef={bodyRef} />
    </div>
  );
}
