export const articleSections = [
  {
    id: 'learn',
    label: 'Learning',
    english: 'LEARNING',
    description: 'Code, courses, and questions still taking shape.',
    empty: 'Nothing here yet. A small question is enough to begin.',
    aliases: ['learn', 'learning', 'study', '学习'],
  },
  {
    id: 'life',
    label: 'Life',
    english: 'LIFE',
    description: 'Skies, everyday life, and moments that need no conclusion.',
    empty: 'A space for life. Waiting for a moment worth keeping.',
    aliases: ['life', 'living', 'daily', '生活'],
  },
];

export const defaultArticleSection = 'learn';

export function resolveArticleSection(value, filename) {
  if (value == null || value === '') return defaultArticleSection;
  if (typeof value !== 'string') throw new Error(`${filename}: section 必须是字符串`);
  const key = value.trim().toLowerCase();
  const match = articleSections.find(
    (section) => section.id === key || section.aliases.some((alias) => alias.toLowerCase() === key),
  );
  if (!match) {
    throw new Error(
      `${filename}: section 请使用 ${articleSections.map((section) => `${section.id}（${section.label}）`).join(' 或 ')}`,
    );
  }
  return match.id;
}

export function articleSectionById(id) {
  return articleSections.find((section) => section.id === id) ?? articleSections[0];
}
