import type { ArticleSummary } from './types';

/** Build once per collection, then reuse slug lookups, groups, and search strings. */
export function createContentIndex(
  articles: ArticleSummary[],
  groupOf: (article: ArticleSummary) => string,
  labels: ReadonlyMap<string, string>,
  bodyText: Readonly<Record<string, string>> = {},
) {
  const bySlug = new Map<string, ArticleSummary>();
  const groups = new Map<string, ArticleSummary[]>();
  const search = new Map<string, string>();

  for (const article of articles) {
    bySlug.set(article.slug, article);
    const group = groupOf(article);
    const entries = groups.get(group);
    if (entries) entries.push(article);
    else groups.set(group, [article]);
  }

  // Listings and readers need lookups, but only searches need normalized text.
  function matches(article: ArticleSummary, group: string, needle: string) {
    let text = search.get(article.slug);
    if (text === undefined) {
      text = [
        article.title,
        article.description,
        ...article.tags,
        labels.get(group),
        Object.hasOwn(bodyText, article.slug) ? bodyText[article.slug] : '',
      ]
        .join(' ')
        .toLowerCase();
      search.set(article.slug, text);
    }
    return text.includes(needle);
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
              entries.filter((article) => matches(article, group, needle)),
            ]),
          );
      previousNeedle = needle;
      return previousGroups;
    },
  };
}
