export const articleSections = [
  {
    id: 'learn',
    label: '学习',
    english: 'LEARNING',
    description: '代码、课程，以及还没完全想明白的问题。',
    empty: '这一栏还是空白。一个足够小的问题，就够开始。',
    aliases: ['learn', 'learning', 'study', '学习'],
  },
  {
    id: 'life',
    label: '生活',
    english: 'LIFE',
    description: '天空、日常，以及不必急着变成结论的片刻。',
    empty: '这一栏留给生活。等一个值得留下来的瞬间。',
    aliases: ['life', 'living', 'daily', '生活'],
  },
];

export const defaultArticleSection = 'learn';

export function resolveArticleSection(value, filename) {
  if (value == null || value === '') return defaultArticleSection;
  if (typeof value !== 'string') throw new Error(`${filename}: section 必须是字符串`);
  const key = value.trim().toLowerCase();
  const match = articleSections.find(section => section.id === key || section.aliases.some(alias => alias.toLowerCase() === key));
  if (!match) {
    throw new Error(`${filename}: section 请使用 ${articleSections.map(section => `${section.id}（${section.label}）`).join(' 或 ')}`);
  }
  return match.id;
}

export function articleSectionById(id) {
  return articleSections.find(section => section.id === id) ?? articleSections[0];
}
