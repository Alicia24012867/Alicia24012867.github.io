declare module 'virtual:articles' {
  const articles: import('./content/types').ArticleSummary[];
  export function loadArticle(slug: string): Promise<import('./content/types').ArticleBody>;
  export function loadSearch(): Promise<Record<string, string>>;
  export default articles;
}

declare module 'virtual:notes' {
  const notes: import('./content/types').ArticleSummary[];
  export function loadArticle(slug: string): Promise<import('./content/types').ArticleBody>;
  export function loadSearch(): Promise<Record<string, string>>;
  export default notes;
}
