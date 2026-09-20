import type { ArticleSummary } from './types';

/** Build once per collection, then reuse slug lookups, groups, and search strings. */
export function createContentIndex(
  articles: ArticleSummary[],
  groupOf: (article: ArticleSummary) => string,
  labels: ReadonlyMap<string, string>,
  bodyText: Readonly<Record<string, string>> = {},
) {
  const bySlug = new Map(articles.map((article) => [article.slug, article]));
  const groups = new Map<string, ArticleSummary[]>();
  const search = new Map<string, string>();

  for (const article of articles) {
    const group = groupOf(article);
    const entries = groups.get(group) ?? [];
    entries.push(article);
    groups.set(group, entries);
    search.set(
      article.slug,
      [
        article.title,
        article.description,
        ...article.tags,
        labels.get(group),
        Object.hasOwn(bodyText, article.slug) ? bodyText[article.slug] : '',
      ]
        .join(' ')
        .toLowerCase(),
    );
  }

  // Keep only the last result: extending a substring query can only remove matches.
  let previousNeedle = '';
  let previousGroups = groups;
  return {
    bySlug,
    groups,
    filter(query: string) {
      const needle = query.trim().toLowerCase();
      if (needle === previousNeedle) return previousGroups;
      const candidates = needle.includes(previousNeedle) ? previousGroups : groups;
      previousGroups = !needle
        ? groups
        : new Map(
            [...candidates].map(([group, entries]) => [
              group,
              entries.filter((article) => search.get(article.slug)!.includes(needle)),
            ]),
          );
      previousNeedle = needle;
      return previousGroups;
    },
  };
}
