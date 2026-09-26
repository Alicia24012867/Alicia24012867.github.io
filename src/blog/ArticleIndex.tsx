import { memo, useDeferredValue, useMemo } from 'react';
import { blogIndex } from './catalog';
import ArticleTags from '../content/ArticleTags';
import Icon from '../components/Icon';
import type { ArticleSummary } from '../content/types';
import { articleSections } from '../config/sections.mjs';
import ArticleMeta from '../content/ArticleMeta';
import { articleUrl } from '../content/urls';
import { useSearchQuery } from '../hooks/useSearchQuery';
import { useArticleSort } from '../hooks/useArticleSort';
import {
  articleSortOptions,
  parseArticleSort,
  sortArticles,
  type ArticleSort,
} from '../content/sort';

function JournalEntry({
  article,
  index,
  onTag,
  query,
  sort,
}: {
  article: ArticleSummary;
  index: number;
  onTag: (tag: string) => void;
  query: string;
  sort: ArticleSort;
}) {
  return (
    <article className="journal-entry">
      <span className="journal-entry-number">
        {String(index + 1).padStart(2, '0')}
        <span>/</span>
      </span>
      <div className="journal-entry-content">
        <ArticleMeta article={article} showDetails />
        <h3 className="article-title">
          <a href={articleUrl(article.slug, query, sort)}>{article.title}</a>
        </h3>
        <p>{article.description}</p>
        <ArticleTags article={article} onTag={onTag} showFormat />
      </div>
      <a
        className="journal-read"
        href={articleUrl(article.slug, query, sort)}
        aria-label={`Read: ${article.title}`}
      >
        <Icon name="arrow" />
      </a>
    </article>
  );
}

const JournalEntries = memo(function JournalEntries({
  entries,
  onTag,
  query,
  sort,
}: {
  entries: ArticleSummary[];
  onTag: (tag: string) => void;
  query: string;
  sort: ArticleSort;
}) {
  return entries.map((article, index) => (
    <JournalEntry
      article={article}
      index={index}
      key={article.slug}
      onTag={onTag}
      query={query}
      sort={sort}
    />
  ));
});

export default function ArticleIndex() {
  const [query, setQuery] = useSearchQuery();
  const [sort, setSort] = useArticleSort();
  const deferredQuery = useDeferredValue(query);
  const needle = deferredQuery.trim().toLowerCase();
  const groups = useMemo(
    () =>
      new Map(
        [...blogIndex.filter(deferredQuery)].map(([id, entries]) => [
          id,
          sortArticles(entries, sort),
        ]),
      ),
    [deferredQuery, sort],
  );
  const hasResults = [...groups.values()].some((entries) => entries.length > 0);

  const clearQuery = () => setQuery('');

  return (
    <>
      <section className="journal-hero">
        <div className="journal-width">
          <p className="eyebrow">
            <span /> ALICIA'S BLOG
          </p>
          <h1>
            Stories of <br className="journal-mobile-break" />
            discovery<span>.</span>
          </h1>
          <p>
            Ideas from code, moments of understanding,
            <br />
            and everyday memories worth keeping.
          </p>
          <div className="journal-hero-note">
            <span>✧</span> Writing, learning, becoming.
          </div>
          <div className="journal-doodle" aria-hidden="true">
            <Icon name="book" />
            <span>✦</span>
            <i>thoughts, in the making</i>
          </div>
        </div>
      </section>
      <div className="journal-width journal-list-section">
        <div className="journal-list-heading">
          <div>
            <p className="eyebrow">THE NOTEBOOK</p>
            <h2 id="journal-list-title">
              All posts
              <span className="article-count">
                {String(blogIndex.bySlug.size).padStart(2, '0')}
              </span>
            </h2>
          </div>
          <div className="article-list-controls">
            <label className="article-search">
              <span className="visually-hidden">Search post titles, summaries, or tags</span>
              <Icon name="book" />
              <input
                type="search"
                placeholder="Find a story…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="article-sort">
              <span>Sort by</span>
              <select
                value={sort}
                onChange={(event) => setSort(parseArticleSort(event.target.value))}
              >
                {articleSortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <nav className="journal-section-nav" aria-label="Blog categories">
          {articleSections
            .filter((section) => !needle || (groups.get(section.id)?.length ?? 0) > 0)
            .map((section) => (
              <a key={section.id} href={`#section-${section.id}`}>
                {section.label}
              </a>
            ))}
        </nav>
        <div className="article-results" aria-live="polite">
          {needle && !hasResults ? (
            <div className="journal-empty">
              <Icon name="cloud" />
              <h3>No posts found</h3>
              <p>Try another keyword or browse all categories.</p>
              <button className="button button-primary" onClick={clearQuery}>
                View all posts
              </button>
            </div>
          ) : (
            articleSections.map((section) => {
              const entries = groups.get(section.id) ?? [];
              if (needle && !entries.length) return null;
              return (
                <section
                  className="journal-shelf"
                  id={`section-${section.id}`}
                  key={section.id}
                  aria-labelledby={`shelf-${section.id}`}
                >
                  <div className="journal-shelf-heading">
                    <div>
                      <p className="eyebrow">{section.english}</p>
                      <h3 id={`shelf-${section.id}`}>
                        {section.label}
                        <span className="article-count">
                          {String(entries.length).padStart(2, '0')}
                        </span>
                      </h3>
                    </div>
                    <p>{section.description}</p>
                  </div>
                  {entries.length ? (
                    <JournalEntries
                      entries={entries}
                      onTag={setQuery}
                      query={deferredQuery}
                      sort={sort}
                    />
                  ) : (
                    <div className="journal-shelf-empty">
                      <Icon name="cloud" />
                      <p>{section.empty}</p>
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
        <div className="journal-list-bottom">
          <span>✧</span> Every post brings a little more clarity.
        </div>
      </div>
    </>
  );
}
