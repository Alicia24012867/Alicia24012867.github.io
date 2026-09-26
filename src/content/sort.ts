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

export function sortArticles<T extends Pick<ArticleSummary, 'slug' | 'title' | 'date' | 'updated'>>(
  articles: readonly T[],
  sort: ArticleSort,
): T[] {
  return [...articles].sort((a, b) => {
    let comparison: number;
    if (sort === 'title') comparison = titles.compare(a.title, b.title);
    else if (sort === 'updated')
      comparison = Date.parse(b.updated || b.date) - Date.parse(a.updated || a.date);
    else {
      comparison = Date.parse(b.date) - Date.parse(a.date);
      if (sort === 'oldest') comparison = -comparison;
    }
    return comparison || a.slug.localeCompare(b.slug);
  });
}
