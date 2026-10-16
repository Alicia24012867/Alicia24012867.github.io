import type { ArticleSummary } from './types';

/** A query as searches compare it. */
export const searchTerm = (query: string) => query.trim().toLowerCase();

const special = /[\\^$.*+?()[\]{}|/]/g;

/**
 * Finds a lowercase search term in text of any case without making a lowercase copy of the
 * text. Terms without cased letters, such as Chinese, are looked up as they are.
 */
export function caseless(needle: string) {
  const cased = needle !== needle.toUpperCase();
  const source = needle.replace(special, '\\$&');
  const anywhere = cased ? new RegExp(source, 'giu') : undefined;
  const leading = cased ? new RegExp(source, 'iuy') : undefined;
  return {
    /** The first match at or after `from`, as its start and end. */
    find(text: string, from = 0): [number, number] | undefined {
      if (!anywhere) {
        const at = text.indexOf(needle, from);
        return at < 0 ? undefined : [at, at + needle.length];
      }
      anywhere.lastIndex = from;
      const match = anywhere.exec(text);
      return match ? [match.index, match.index + match[0].length] : undefined;
    },
    /** Whether `text` begins with the term. */
    begins(text: string) {
      if (!leading) return text.startsWith(needle);
      leading.lastIndex = 0;
      return leading.test(text);
    },
  };
}

/** Every match of the query in a short text such as a title, to mark them. */
export function matchesIn(text: string, query: string) {
  const needle = searchTerm(query);
  const spans: [number, number][] = [];
  if (!needle) return spans;
  const { find } = caseless(needle);
  for (let span = find(text); span; span = find(text, span[1])) spans.push(span);
  return spans;
}

export interface Excerpt {
  text: string;
  /** Where the match lies in `text`. */
  match: [number, number];
  /** Whether the body goes on before and after the excerpt. */
  before: boolean;
  after: boolean;
}

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;
const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

/**
 * A stretch of `body` around the first match of the query, to show why a document matched.
 * Where the text has spaces, its ends fall between words.
 */
export function excerptOf(
  body: string,
  query: string,
  { before = 24, after = 140 } = {},
): Excerpt | undefined {
  const needle = searchTerm(query);
  const span = needle ? caseless(needle).find(body) : undefined;
  if (!span) return undefined;
  let start = Math.max(0, span[0] - before);
  let end = Math.min(body.length, span[1] + after);
  const space = body.indexOf(' ', start);
  if (start > 0 && space >= 0 && space < span[0] && space - start < 16) start = space + 1;
  const lastSpace = body.lastIndexOf(' ', end);
  if (end < body.length && lastSpace > span[1] && end - lastSpace < 16) end = lastSpace;
  if (isLowSurrogate(body.charCodeAt(start))) start++;
  if (end < body.length && isHighSurrogate(body.charCodeAt(end - 1))) end--;
  return {
    text: body.slice(start, end),
    match: [span[0] - start, span[1] - start],
    before: start > 0,
    after: end < body.length,
  };
}

/** A document's full text, if the index has it; inherited names are never documents. */
export const bodyLookup =
  (bodyText: Readonly<Record<string, string>>) =>
  (slug: string): string =>
    Object.hasOwn(bodyText, slug) ? bodyText[slug] : '';

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

  return {
    bySlug,
    groups,
    filter: createContentFilter(groups, labels, bodyText),
    bodyOf: bodyLookup(bodyText),
  };
}

/** Attach independent search state to existing groups without rebuilding the catalog. */
export function createContentFilter(
  groups: ReadonlyMap<string, ArticleSummary[]>,
  labels: ReadonlyMap<string, string>,
  bodyText: Readonly<Record<string, string>> = {},
) {
  const search = new Map<string, { meta: string; body: string }>();
  const bodyOf = bodyLookup(bodyText);
  // Listings and readers need lookups, but only searches need normalized text.
  // Metadata and body stay apart: full text keeps its case for excerpts and is
  // matched in place, so each body stays the loaded string with no second copy.
  function textOf(article: ArticleSummary, group: string) {
    let text = search.get(article.slug);
    if (!text) {
      text = {
        meta: [article.title, article.description, ...article.tags, labels.get(group)]
          .join(' ')
          .toLowerCase(),
        body: bodyOf(article.slug),
      };
      search.set(article.slug, text);
    }
    return text;
  }

  // Keep only the last result: extending a substring query can only remove matches.
  let previousNeedle = '';
  let previousGroups = groups;
  return (query: string) => {
    const needle = searchTerm(query);
    if (needle === previousNeedle) return previousGroups;
    const inBody = caseless(needle);
    // Searching "meta body" as one string also matches across the joining space.
    const spans: [string, ReturnType<typeof caseless>][] = [];
    for (let at = needle.indexOf(' '); at !== -1; at = needle.indexOf(' ', at + 1))
      spans.push([needle.slice(0, at), caseless(needle.slice(at + 1))]);
    const matches = (article: ArticleSummary, group: string) => {
      const { meta, body } = textOf(article, group);
      return (
        meta.includes(needle) ||
        !!inBody.find(body) ||
        spans.some(([head, tail]) => meta.endsWith(head) && tail.begins(body))
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
