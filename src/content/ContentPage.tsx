import { useEffect, useState, type ComponentType } from 'react';
import SiteLayout from '../components/layout/SiteLayout';
import Icon from '../components/Icon';
import { usePageMeta } from '../hooks/usePageMeta';
import { listingUrl, queryFromSearch } from './urls';
import type { Article, ArticleBody, ArticleSummary } from './types';

type Reader = ComponentType<{ article: Article }>;
type Loaders = {
  loadBody: (slug: string) => Promise<ArticleBody>;
  loadReader: () => Promise<{ default: Reader }>;
};

/** Shared query routing; collection-specific lists and readers keep their own presentation. */
export default function ContentPage({
  section,
  bySlug,
  titles,
  description,
  Listing,
  loadBody,
  loadReader,
}: Loaders & {
  section: 'blog' | 'notes';
  bySlug: ReadonlyMap<string, ArticleSummary>;
  titles: { listing: string; missing: string; suffix: string };
  description: string;
  Listing: ComponentType;
}) {
  const slug = new URLSearchParams(window.location.search).get('post');
  const summary = slug ? bySlug.get(slug) : undefined;
  usePageMeta(
    summary ? `${summary.title}${titles.suffix}` : slug ? titles.missing : titles.listing,
    summary?.description || description,
  );
  const kind = section === 'blog' ? 'post' : 'note';
  return (
    <SiteLayout section={section}>
      {!slug ? (
        <Listing />
      ) : summary ? (
        <ArticlePage
          key={summary.slug}
          summary={summary}
          loadBody={loadBody}
          loadReader={loadReader}
        />
      ) : (
        <div className="journal-width journal-empty missing-article">
          <Icon name="cloud" />
          <p className="eyebrow">PAGE NOT FOUND</p>
          <h1>This {kind} is not here yet.</h1>
          <p>It may have moved or may still be a draft.</p>
          <a
            className="button button-primary"
            href={listingUrl(queryFromSearch(window.location.search))}
          >
            Back to all {kind}s<Icon name="arrow" />
          </a>
        </div>
      )}
    </SiteLayout>
  );
}

/** Fetch the selected body, reader and optional formula styles concurrently. */
function ArticlePage({ summary, loadBody, loadReader }: Loaders & { summary: ArticleSummary }) {
  const [page, setPage] = useState<{ article: Article; Reader: Reader }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setPage(undefined);
    Promise.all([
      loadBody(summary.slug),
      loadReader(),
      summary.hasMath ? import('katex/dist/katex.min.css') : Promise.resolve(),
    ])
      .then(([body, { default: Reader }]) => {
        if (!cancelled) setPage({ article: { ...summary, ...body }, Reader });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [summary, loadBody, loadReader]);

  if (page) return <page.Reader article={page.article} />;
  return (
    <div className="journal-width reading-page" aria-busy={!failed}>
      <header className="reading-header">
        <h1 className="article-title">{summary.title}</h1>
        <p className="reading-description">{summary.description}</p>
      </header>
      {failed ? (
        <div role="alert">
          <p>This page could not be loaded. Please try again.</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      ) : (
        <p role="status">Loading article…</p>
      )}
    </div>
  );
}
