import notes, { loadSearch } from 'virtual:notes';
import { createContentIndex } from '../content/search';
import { noteTopics, topicOf } from '../config/noteTopics';

const collator = new Intl.Collator('en');
const sortedNotes = [...notes].sort((a, b) => collator.compare(a.title, b.title));
const labels = new Map(noteTopics.map((topic) => [topic.id, topic.label]));
const groupOf = (note: (typeof notes)[number]) => topicOf(note).id;
export const noteIndex = createContentIndex(sortedNotes, groupOf, labels);

let searchIndex: Promise<typeof noteIndex> | undefined;
export function loadSearchIndex() {
  searchIndex ??= loadSearch()
    .then((text) => createContentIndex(sortedNotes, groupOf, labels, text))
    .catch((error) => {
      searchIndex = undefined;
      throw error;
    });
  return searchIndex;
}
