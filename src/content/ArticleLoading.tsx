import ArticleHeader from './ArticleHeader';
import type { Collection } from './urls';
import type { ArticleSummary } from './types';

/** The page while a document and its reader load, or the way back when they could not. */
export default function ArticleLoading({
  summary,
  section,
  failed,
}: {
  summary: ArticleSummary;
  section: Collection;
  failed: boolean;
}) {
  return (
    <div
      className={`journal-width reading-page${failed ? '' : ' reading-loading'}`}
      aria-busy={!failed}
    >
      <ArticleHeader article={summary} metadata={false} collection={section} />
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
