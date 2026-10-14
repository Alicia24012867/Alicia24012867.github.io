import type { ArticleSummary } from './types';

export const articleSortOptions = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'title', label: 'Title' },
] as const;

export type ArticleSort = (typeof articleSortOptions)[number]['value'];

export function parseArticleSort(value: string | null): ArticleSort {
  return articleSortOptions.find((option) => option.value === value)?.value ?? 'newest';
}

export const sortFromSearch = (search: string) =>
  parseArticleSort(new URLSearchParams(search).get('sort'));

const titles = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

export function sortArticles<
  T extends Pick<ArticleSummary, 'slug' | 'title' | 'date' | 'updated' | 'pin'>,
>(articles: readonly T[], sort: ArticleSort): T[] {
  // Slug ties keep localeCompare: V8's fast path beats a cached Intl.Collator on ASCII.
  if (sort === 'title')
    return [...articles].sort(
      (a, b) =>
        Number(b.pin === true) - Number(a.pin === true) ||
        titles.compare(a.title, b.title) ||
        a.slug.localeCompare(b.slug),
    );
  // Decorate each article once, so comparisons read numbers instead of parsing
  // dates or looking them up for every pair.
  const direction = sort === 'oldest' ? 1 : -1;
  return articles
    .map((article) => ({
      article,
      pin: Number(article.pin === true),
      time: Date.parse(sort === 'updated' ? article.updated || article.date : article.date),
    }))
    .sort(
      (a, b) =>
        b.pin - a.pin ||
        direction * (a.time - b.time) ||
        a.article.slug.localeCompare(b.article.slug),
    )
    .map(({ article }) => article);
}
