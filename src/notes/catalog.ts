import notes, { loadSearch } from 'virtual:notes';
import { bodyLookup, createContentFilter, createContentIndex } from '../content/search';
import { noteSections } from '../config/sections.mjs';

const collator = new Intl.Collator('en');
const sortedNotes = [...notes].sort((a, b) => collator.compare(a.title, b.title));
export const noteTopics = noteSections.collect(notes);
const labels = new Map(noteTopics.map((topic) => [topic.id, topic.label]));
const groupOf = (note: (typeof notes)[number]) => note.section;
export const noteIndex = createContentIndex(sortedNotes, groupOf, labels);

let searchIndex: Promise<typeof noteIndex> | undefined;
export function loadSearchIndex() {
  searchIndex ??= loadSearch()
    .then((text) => ({
      ...noteIndex,
      filter: createContentFilter(noteIndex.groups, labels, text),
      bodyOf: bodyLookup(text),
    }))
    .catch((error) => {
      searchIndex = undefined;
      throw error;
    });
  return searchIndex;
}
