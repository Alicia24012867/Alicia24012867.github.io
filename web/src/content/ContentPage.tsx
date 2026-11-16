import { useEffect, useMemo, useState, type ComponentType } from 'react';
import SiteLayout from '../components/layout/SiteLayout';
import Icon from '../components/Icon';
import ArticleLoading from './ArticleLoading';
import { usePageMeta } from '../hooks/usePageMeta';
import { contentPageMeta } from './meta';
import { unlistedSummary } from './locked/unlisted';
import { listingUrl, queryFromSearch, slugFromLocation, type Collection } from './urls';
import { sortFromSearch } from './sort';
import type { Article, ArticleBody, ArticleSummary } from './types';

type Reader = ComponentType<{ article: Article }>;
type Loaders = {
  loadBody: (slug: string) => Promise<ArticleBody>;
  loadReader: () => Promise<{ default: Reader }>;
};
type Locked = typeof import('./locked/LockedArticle').default;

// The form that opens locked documents loads only for them.
const loadLocked = () => import('./locked/LockedArticle');

/** Shared static routing; collection-specific lists and readers keep their own presentation. */
export default function ContentPage({
  section,
  bySlug,
  titles,
  description,
  Listing,
  loadBody,
  loadReader,
}: Loaders & {
  section: Collection;
  bySlug: ReadonlyMap<string, ArticleSummary>;
  titles: { listing: string; missing: string; suffix: string };
  description: string;
  Listing: ComponentType;
}) {
  const slug = slugFromLocation(section);
  const summary = useMemo(
    () => (slug ? (bySlug.get(slug) ?? unlistedSummary(section, slug)) : undefined),
    [slug, bySlug, section],
  );
  // Both addresses of one document share the same title, canonical and share card.
  usePageMeta(contentPageMeta({ section, slug, summary, titles, description }));
  const kind = section === 'blog' ? 'post' : 'note';
  return (
    <SiteLayout section={section}>
      {!slug ? (
        <Listing />
      ) : summary?.locked ? (
        <LockedPage
          key={summary.slug}
          summary={summary}
          url={summary.locked}
          section={section}
          loadReader={loadReader}
          titleSuffix={titles.suffix}
        />
      ) : summary ? (
        <ArticlePage
          key={summary.slug}
          summary={summary}
          section={section}
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
            href={listingUrl(
              section,
              queryFromSearch(window.location.search),
              section === 'blog' ? sortFromSearch(window.location.search) : 'newest',
            )}
          >
            Back to all {kind}s<Icon name="arrow" />
          </a>
        </div>
      )}
    </SiteLayout>
  );
}

/** Fetch the selected body, reader and optional formula styles concurrently. */
function ArticlePage({
  summary,
  section,
  loadBody,
  loadReader,
}: Loaders & { summary: ArticleSummary; section: Collection }) {
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
  return <ArticleLoading summary={summary} section={section} failed={failed} />;
}

/** A locked document, behind the form that opens it. */
function LockedPage(props: Parameters<Locked>[0]) {
  const [Locked, setLocked] = useState<Locked>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLocked().then(
      (module) => {
        if (!cancelled) setLocked(() => module.default);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (Locked) return <Locked {...props} />;
  return <ArticleLoading summary={props.summary} section={props.section} failed={failed} />;
}
