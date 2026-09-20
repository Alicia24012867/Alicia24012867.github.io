import { useEffect, useState, type ComponentType } from 'react';
import type { Article, ArticleBody, ArticleSummary } from '../content/types';

type LoadedPage = { body: ArticleBody; Reader: ComponentType<{ article: Article }> };

/** Load only the selected document and its reader, with a retry path for network failures. */
export default function ArticlePage({
  summary,
  load,
}: {
  summary: ArticleSummary;
  load: (slug: string) => Promise<LoadedPage>;
}) {
  const [page, setPage] = useState<LoadedPage>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setPage(undefined);
    Promise.all([
      load(summary.slug),
      summary.hasMath ? import('katex/dist/katex.min.css') : Promise.resolve(),
    ])
      .then(([result]) => {
        if (!cancelled) setPage(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [summary, load]);

  if (page) return <page.Reader article={{ ...summary, ...page.body }} />;
  return (
    <div className="journal-width reading-page" aria-busy={!failed}>
      <header className="reading-header">
        <h1>{summary.title}</h1>
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
