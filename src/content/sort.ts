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
  // Parse each date once, rather than twice per comparison during sorting.
  const dates =
    sort === 'title'
      ? undefined
      : new Map(
          articles.map((article) => [
            article,
            Date.parse(sort === 'updated' ? article.updated || article.date : article.date),
          ]),
        );
  const direction = sort === 'oldest' ? 1 : -1;
  return [...articles].sort((a, b) => {
    const pinnedFirst = Number(b.pin === true) - Number(a.pin === true);
    if (pinnedFirst) return pinnedFirst;
    const comparison = dates
      ? direction * (dates.get(a)! - dates.get(b)!)
      : titles.compare(a.title, b.title);
    return comparison || a.slug.localeCompare(b.slug);
  });
}
