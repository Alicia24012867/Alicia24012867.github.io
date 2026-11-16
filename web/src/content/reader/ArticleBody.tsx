import './reader.css';
import { useMemo, useRef } from 'react';
import type { Article } from '../types';
import ArticleFigures from './ArticleFigures';
import ArticleToc from './ArticleToc';
import ContinueReading from './ContinueReading';
import FootnotePreview from './FootnotePreview';
import LinkPreview, { type LinkPreviewSource } from './LinkPreview';
import ListenPlayer from './ListenPlayer';
import HandwrittenSignature from '../../components/signature/HandwrittenSignature';
import PhotoViewer from './PhotoViewer';
import QuoteLinks from './QuoteLinks';
import ReadingProgress from './ReadingProgress';
import { useArticleReader } from './useArticleReader';

export default function ArticleBody({
  article,
  eyebrow,
  label = 'Article content',
  previews,
}: {
  article: Article;
  /** The small capitals the header opens with, repeated on pictures of quoted passages. */
  eyebrow: string;
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
        <ContinueReading bodyRef={bodyRef} article={article} />
        <article
          ref={bodyRef}
          className="article-body"
          lang={article.lang}
          aria-label={label}
          dangerouslySetInnerHTML={markup}
        />
        <HandwrittenSignature />
      </div>
      <ArticleToc headings={article.headings} bodyRef={bodyRef} minutes={article.readingMinutes} />
      <ArticleFigures key={article.slug} bodyRef={bodyRef} />
      <FootnotePreview bodyRef={bodyRef} slug={article.slug} />
      {previews && <LinkPreview bodyRef={bodyRef} slug={article.slug} source={previews} />}
      <PhotoViewer bodyRef={bodyRef} slug={article.slug} />
      <QuoteLinks bodyRef={bodyRef} article={article} eyebrow={eyebrow} />
      <ListenPlayer bodyRef={bodyRef} article={article} />
      <ReadingProgress bodyRef={bodyRef} />
    </div>
  );
}
