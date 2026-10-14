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

  for (const article of articles) {
    bySlug.set(article.slug, article);
    const group = groupOf(article);
    const entries = groups.get(group);
    if (entries) entries.push(article);
    else groups.set(group, [article]);
  }

  return { bySlug, groups, filter: createContentFilter(groups, labels, bodyText) };
}

/** Attach independent search state to existing groups without rebuilding the catalog. */
export function createContentFilter(
  groups: ReadonlyMap<string, ArticleSummary[]>,
  labels: ReadonlyMap<string, string>,
  bodyText: Readonly<Record<string, string>> = {},
) {
  const search = new Map<string, { meta: string; body: string }>();
  // Listings and readers need lookups, but only searches need normalized text.
  // Metadata and body stay apart: the build already lowercases full text, so an
  // unchanged body keeps pointing at the loaded string instead of a second copy.
  function textOf(article: ArticleSummary, group: string) {
    let text = search.get(article.slug);
    if (!text) {
      const raw = Object.hasOwn(bodyText, article.slug) ? bodyText[article.slug] : '';
      const body = raw.toLowerCase();
      text = {
        meta: [article.title, article.description, ...article.tags, labels.get(group)]
          .join(' ')
          .toLowerCase(),
        body: body === raw ? raw : body,
      };
      search.set(article.slug, text);
    }
    return text;
  }

  // Keep only the last result: extending a substring query can only remove matches.
  let previousNeedle = '';
  let previousGroups = groups;
  return (query: string) => {
    const needle = query.trim().toLowerCase();
    if (needle === previousNeedle) return previousGroups;
    // Searching "meta body" as one string also matches across the joining space.
    const spans: [string, string][] = [];
    for (let at = needle.indexOf(' '); at !== -1; at = needle.indexOf(' ', at + 1))
      spans.push([needle.slice(0, at), needle.slice(at + 1)]);
    const matches = (article: ArticleSummary, group: string) => {
      const { meta, body } = textOf(article, group);
      return (
        meta.includes(needle) ||
        body.includes(needle) ||
        spans.some(([head, tail]) => meta.endsWith(head) && body.startsWith(tail))
      );
    };
    const candidates = needle.includes(previousNeedle) ? previousGroups : groups;
    previousGroups = !needle
      ? groups
      : new Map(
          [...candidates].map(([group, entries]) => [
            group,
            entries.filter((article) => matches(article, group)),
          ]),
        );
    previousNeedle = needle;
    return previousGroups;
  };
}
