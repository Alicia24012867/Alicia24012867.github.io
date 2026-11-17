import './locked.css';
import { useEffect, useState, type ComponentType } from 'react';
import Icon from '../../components/Icon';
import { api, ApiError, signInUrl } from '../../api/client';
import { signOut, useMe } from '../../api/me';
import ArticleLoading from '../ArticleLoading';
import { textLanguage } from '../language.mjs';
import type { Article, ArticleBody, ArticleSummary } from '../types';
import { articlePath, listingUrl, type Collection } from '../urls';

type Reader = ComponentType<{ article: Article }>;
type Status = 'loading' | 'signed-out' | 'not-for-you' | 'failed';

/**
 * A locked document, from the blog API: it opens for a reader whose groups reach its level,
 * once they have signed in. Its photos and attachments come from the API the same way.
 */
export default function PrivateArticle({
  summary,
  url,
  section,
  loadReader,
  titleSuffix,
}: {
  summary: ArticleSummary;
  /** The document's sealed file, which the API takes the place of. */
  url: string;
  section: Collection;
  loadReader: () => Promise<{ default: Reader }>;
  titleSuffix: string;
}) {
  const kind = section === 'blog' ? 'post' : 'note';
  const [status, setStatus] = useState<Status>('loading');
  const [page, setPage] = useState<{ article: Article; Reader: Reader }>();
  const { user } = useMe();

  useEffect(() => {
    let cancelled = false;
    const path = articlePath(section, summary.slug);
    Promise.all([
      api<ArticleBody & Partial<ArticleSummary>>(
        `/api/private/document?path=${encodeURIComponent(path)}`,
      ),
      loadReader(),
    ])
      .then(async ([opened, { default: Reader }]) => {
        if (opened.hasMath) await import('katex/dist/katex.min.css');
        if (!cancelled) setPage({ article: { ...summary, ...opened, locked: url }, Reader });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) setStatus('signed-out');
        else if (error instanceof ApiError && error.status === 403) setStatus('not-for-you');
        else setStatus('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [summary, section, url, loadReader]);

  useEffect(() => {
    if (page) document.title = page.article.title + titleSuffix;
  }, [page, titleSuffix]);

  // Attachments download under their own names; pictures and the like open in a new tab.
  useEffect(() => {
    if (!page?.article.files) return;
    for (const [address, name] of Object.entries(page.article.files)) {
      const shown = /\.(avif|gif|jpe?g|png|svg|webp|pdf|txt|mp3|m4a|mp4|webm)$/i.test(name);
      for (const link of document.querySelectorAll<HTMLAnchorElement>('.article-body a[href]')) {
        if (new URL(link.href).pathname !== new URL(address, location.href).pathname) continue;
        if (shown) link.target = '_blank';
        else link.download = name;
      }
    }
  }, [page]);

  if (page) return <page.Reader article={page.article} />;
  if (status === 'loading' || status === 'failed')
    return <ArticleLoading summary={summary} section={section} failed={status === 'failed'} />;
  return (
    <div className="journal-width reading-page">
      <div className="journal-empty locked-form">
        <Icon name="lock" />
        <p className="eyebrow">PRIVATE {kind.toUpperCase()}</p>
        <h1 className="article-title" lang={textLanguage(summary.title)}>
          {summary.title}
        </h1>
        {status === 'signed-out' ? (
          <>
            <p>This {kind} is for friends and family. Sign in to read it.</p>
            <div className="locked-field">
              <a className="button button-primary" href={signInUrl()}>
                <Icon name="key" />
                Sign in
              </a>
            </div>
            <p className="locked-status">You’ll come right back here afterwards.</p>
          </>
        ) : (
          <>
            <p>
              You’re signed in{user ? ` as ${user.name}` : ''}, but this {kind} is for other
              readers.
            </p>
            <div className="locked-field">
              <a className="button button-primary" href={listingUrl(section)}>
                <Icon name="book" />
                All {kind}s
              </a>
              <button className="button button-ghost" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
            <p className="locked-status">If it should be yours, let me know and I’ll add you.</p>
          </>
        )}
      </div>
    </div>
  );
}
