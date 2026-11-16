import { useEffect, type RefObject } from 'react';
import { caseless, searchTerm } from '../search';
import { queryFromSearch } from '../urls';
import { articleText, collapse, rangeOf } from './textMap';

/**
 * A term found about once in this many characters, or more often, is everywhere: marking
 * every "the" of an essay would only be noise.
 */
const rarerThan = 200;

/**
 * Opened from a search, a document lightly marks where the query comes up in its text
 * until the next click or tap. Formulas and diagrams are not searched for marks.
 */
export function useSearchMarks(bodyRef: RefObject<HTMLElement | null>, html: string) {
  useEffect(() => {
    const root = bodyRef.current;
    const needle = searchTerm(collapse(queryFromSearch(window.location.search)));
    if (!root || Array.from(needle).length < 2) return;
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;
    const flat = articleText(root);
    const { find } = caseless(needle);
    const spans: [number, number][] = [];
    const limit = Math.max(3, flat.text.length / rarerThan);
    for (let span = find(flat.text); span; span = find(flat.text, span[1])) {
      if (spans.length >= limit) return;
      spans.push(span);
    }
    const ranges = spans.flatMap(([from, to]) => rangeOf(flat, { from, to }) ?? []);
    if (!ranges.length) return;
    CSS.highlights.set('search', new Highlight(...ranges));
    const clear = () => {
      CSS.highlights.delete('search');
      document.removeEventListener('pointerdown', clear);
    };
    document.addEventListener('pointerdown', clear);
    return clear;
  }, [bodyRef, html]);
}
