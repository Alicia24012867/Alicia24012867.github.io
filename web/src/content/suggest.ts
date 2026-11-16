import { articlePath, collectionBase, type Collection } from './urls.ts';

/** Each document's slug and title, as `virtual:…/titles` lists them. */
export type Titles = readonly (readonly [slug: string, title: string])[];
export interface Suggestion {
  collection: Collection;
  title: string;
  path: string;
}

/** Below this likeness, a document is not what the address meant. */
const enough = 0.6;
/** A document from the other collection than the address names counts for less. */
const elsewhere = 0.85;

/** Lowercase words, so `thoughts_on_ai`, `Thoughts-on-AI` and "thoughts on AI" read alike. */
const wordsOf = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** How alike two strings are, from 0 to 1, by how few edits turn one into the other. */
export function likeness(a: string, b: string) {
  const longest = Math.max(a.length, b.length);
  if (!longest) return 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        previous[j] + 1,
        row[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = row;
  }
  return 1 - previous[b.length] / longest;
}

/** How well a document's name fits the words of an address. */
function fit(asked: string[], name: string[]) {
  if (!name.length) return 0;
  const spelled = likeness(asked.join(' '), name.join(' '));
  // A shortened or reordered address still names the document's words.
  const has = (word: string) =>
    name.some((other) => other === word || (word.length >= 4 && other.startsWith(word)));
  const found = asked.filter(has).length;
  const shared = name.filter((word) => asked.includes(word)).length;
  return Math.max(spelled, (found / asked.length) * 0.75 + (shared / name.length) * 0.25);
}

/**
 * Up to `limit` published documents that a wrong address probably meant: a slug with a typo,
 * other separators or capitals, a document moved into a folder, or words from its title.
 */
export function suggestionsFor(
  pathname: string,
  titles: Partial<Record<Collection, Titles>>,
  limit = 3,
): Suggestion[] {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // An address with stray percent signs is read as it is.
  }
  const segments = path
    .split('/')
    .filter((segment) => segment && segment !== 'index.html')
    .slice(0, 8)
    .map((segment) => segment.slice(0, 80));
  const named = (Object.keys(titles) as Collection[]).find(
    (collection) => segments[0] === collectionBase[collection].replaceAll('/', ''),
  );
  const rest = named ? segments.slice(1) : segments;
  // A single letter is not enough to go on.
  const asked = [wordsOf(rest.join(' ')), wordsOf(rest.at(-1) ?? '')].filter(
    (words, index, all) =>
      words.join('').length > 1 && (index === 0 || words.join() !== all[0].join()),
  );
  if (!asked.length) return [];
  const scored = (Object.entries(titles) as [Collection, Titles][]).flatMap(([collection, list]) =>
    list.map(([slug, title]) => {
      const names = [wordsOf(slug), wordsOf(slug.split('/').at(-1) ?? ''), wordsOf(title)];
      const score =
        Math.max(...asked.flatMap((words) => names.map((name) => fit(words, name)))) *
        (named && named !== collection ? elsewhere : 1);
      return { collection, title, path: articlePath(collection, slug), score };
    }),
  );
  return scored
    .filter(({ score }) => score >= enough)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map(({ collection, title, path }) => ({ collection, title, path }));
}
