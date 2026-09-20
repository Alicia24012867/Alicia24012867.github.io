import articles from 'virtual:articles';
import { createContentIndex } from '../content';
import { articleSections } from '../config/sections.mjs';

export const blogIndex = createContentIndex(
  articles,
  (article) => article.section,
  new Map(articleSections.map((section) => [section.id, `${section.label} ${section.english}`])),
);
