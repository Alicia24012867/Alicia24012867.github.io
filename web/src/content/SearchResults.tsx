import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import type { SearchOption } from '../components/layout/SiteSearch';
import { blogSections, noteSections } from '../config/sections.mjs';
import { blogIndex } from '../blog/catalog';
import { loadSearchIndex, noteIndex } from '../notes/catalog';
import { textLanguage } from './language.mjs';
import Marked from './Marked';
import { byFit, excerptOf, matchesIn, searchTerm } from './search';
import type { ArticleSummary } from './types';
import { articleUrl, listingUrl, type Collection } from './urls';

type Index = typeof noteIndex;

/** How many of each kind are shown before a link to all of them. */
const shown = 6;

const kinds = {
  blog: { label: 'Posts', one: 'post', many: 'posts', sections: blogSections },
  notes: { label: 'Notes', one: 'note', many: 'notes', sections: noteSections },
} as const;

/**
 * What the listing would find for the query, best fits first, otherwise in the catalog's order:
 * posts newest first, notes by title. Posts match by title, summary, tags and section, as on
 * the blog; notes also by their text, as on the notes page.
 */
function found(index: Index, query: string) {
  const matching = new Set([...index.filter(query).values()].flat());
  return byFit(
    [...index.bySlug.values()].filter((entry) => matching.has(entry)),
    query,
  );
}

function Result({
  collection,
  entry,
  query,
  body,
  id,
  active,
  onPoint,
}: {
  collection: Collection;
  entry: ArticleSummary;
  query: string;
  body: string;
  id: string;
  active: boolean;
  onPoint: () => void;
}) {
  const section = kinds[collection].sections.byId(entry.section);
  const where =
    collection === 'blog' ? `${section.label} · ${entry.date.slice(0, 10)}` : section.label;
  // A match in the text alone shows where it is; otherwise the summary says what it is.
  const named = matchesIn(entry.title, query).length || matchesIn(entry.description, query).length;
  const excerpt = named ? undefined : excerptOf(body, query, { before: 16, after: 100 });
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      className="site-search-option"
      onMouseMove={() => !active && onPoint()}
    >
      <a href={articleUrl(collection, entry.slug, query)} tabIndex={-1}>
        <span className="site-search-line">
          <span className="site-search-title" lang={textLanguage(entry.title)}>
            <Marked text={entry.title} query={query} />
          </span>
          <span className="site-search-where">{where}</span>
        </span>
        {excerpt ? (
          <span className="site-search-context" lang={textLanguage(excerpt.text)}>
            {excerpt.before && '…'}
            {excerpt.text.slice(0, excerpt.match[0])}
            <mark className="search-mark">
              {excerpt.text.slice(excerpt.match[0], excerpt.match[1])}
            </mark>
            {excerpt.text.slice(excerpt.match[1])}
            {excerpt.after && '…'}
          </span>
        ) : (
          <span className="site-search-context" lang={textLanguage(entry.description)}>
            <Marked text={entry.description} query={query} />
          </span>
        )}
      </a>
    </li>
  );
}

/** The results of a site search, grouped into posts and notes, for SiteSearch to choose from. */
export default function SearchResults({
  query,
  id,
  active,
  onActive,
  onOptions,
}: {
  query: string;
  id: string;
  active: number;
  onActive: (index: number) => void;
  onOptions: (options: SearchOption[]) => void;
}) {
  // Notes are found by their titles at once, and by their text once it arrives.
  const [notes, setNotes] = useState<Index>(noteIndex);
  useEffect(() => {
    let current = true;
    loadSearchIndex()
      .then((index) => current && setNotes(index))
      .catch(() => {
        // Without the text, notes are still found by their titles, summaries and tags.
      });
    return () => {
      current = false;
    };
  }, []);

  const deferred = useDeferredValue(query);
  const term = searchTerm(deferred);
  const groups = useMemo(() => {
    if (!term) return [];
    const sources = [
      ['blog', blogIndex],
      ['notes', notes],
    ] as const;
    // Each group's results follow the ones before it in the keyboard's order.
    let first = 0;
    return sources.flatMap(([collection, index]) => {
      const entries = found(index, deferred);
      if (!entries.length) return [];
      const all = entries.length > shown ? listingUrl(collection, deferred.trim()) : undefined;
      const group = { collection, index, entries, all, first };
      first += Math.min(entries.length, shown) + (all ? 1 : 0);
      return [group];
    });
  }, [term, deferred, notes]);

  const options = useMemo(() => {
    const list: SearchOption[] = [];
    const add = (href: string) => list.push({ id: `${id}-option-${list.length}`, href });
    for (const { collection, entries, all } of groups) {
      for (const entry of entries.slice(0, shown))
        add(articleUrl(collection, entry.slug, deferred));
      if (all) add(all);
    }
    return list;
  }, [groups, id, deferred]);
  useLayoutEffect(() => onOptions(options), [options, onOptions]);

  // The chosen result stays in sight as the keyboard moves through them.
  useEffect(() => {
    document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [id, active, options]);

  const total = (collection: Collection, count: number) =>
    `${count} ${count === 1 ? kinds[collection].one : kinds[collection].many}`;
  const status = !term
    ? ''
    : groups.length
      ? groups.map(({ collection, entries }) => total(collection, entries.length)).join(' and ')
      : 'No results';

  return (
    <>
      <p className="site-search-status" role="status">
        {status}
      </p>
      {!term ? (
        <p className="site-search-hint">
          Find posts by their title, summary or tags, and notes by any of their words.
        </p>
      ) : !groups.length ? (
        <p className="site-search-hint">Nothing found for “{deferred.trim()}”.</p>
      ) : (
        <div className="site-search-results" id={`${id}-list`} role="listbox" aria-label="Results">
          {groups.map(({ collection, index, entries, all, first }) => {
            const last = first + Math.min(entries.length, shown);
            return (
              <ul key={collection} role="group" aria-labelledby={`${id}-${collection}`}>
                <li role="presentation" id={`${id}-${collection}`} className="site-search-group">
                  {kinds[collection].label} <span>{entries.length}</span>
                </li>
                {entries.slice(0, shown).map((entry, offset) => (
                  <Result
                    key={entry.slug}
                    collection={collection}
                    entry={entry}
                    query={deferred}
                    body={index.bodyOf(entry.slug)}
                    id={`${id}-option-${first + offset}`}
                    active={first + offset === active}
                    onPoint={() => onActive(first + offset)}
                  />
                ))}
                {all && (
                  <li
                    id={`${id}-option-${last}`}
                    role="option"
                    aria-selected={last === active}
                    className="site-search-option site-search-all"
                    onMouseMove={() => last !== active && onActive(last)}
                  >
                    <a href={all} tabIndex={-1}>
                      See all {total(collection, entries.length)}
                      <Icon name="arrow" />
                    </a>
                  </li>
                )}
              </ul>
            );
          })}
        </div>
      )}
    </>
  );
}
