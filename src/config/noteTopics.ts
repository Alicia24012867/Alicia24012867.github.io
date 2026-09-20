import type { ArticleSummary } from '../content/types';

export const noteTopics = [
  { id: 'formulas', label: 'Formulas', description: 'Definitions, derivations, and assumptions' },
  { id: 'source', label: 'Source code', description: 'Call paths, data structures, and questions' },
  { id: 'cuda', label: 'CUDA API', description: 'Interfaces, usage, and edge cases' },
  {
    id: 'spice',
    label: 'SPICE algorithms',
    description: 'Circuit equations, solvers, and convergence',
  },
  { id: 'other', label: 'Other notes', description: 'Ideas still taking shape' },
];
const topicsById = new Map(noteTopics.map((topic) => [topic.id, topic]));
export const topicOf = (note: ArticleSummary) =>
  topicsById.get(note.slug.split('/')[0]) ?? noteTopics[4];
