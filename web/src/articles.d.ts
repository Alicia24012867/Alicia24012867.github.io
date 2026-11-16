declare module 'virtual:articles' {
  const articles: import('./content/types').ArticleSummary[];
  export function loadArticle(slug: string): Promise<import('./content/types').ArticleBody>;
  export function loadSearch(): Promise<Record<string, string>>;
  export default articles;
}

declare module 'virtual:articles/latest' {
  const latest: { title: string; date: string; path: string } | null;
  export default latest;
}

declare module 'virtual:articles/titles' {
  const titles: [slug: string, title: string][];
  export default titles;
}

declare module 'virtual:notes/titles' {
  const titles: [slug: string, title: string][];
  export default titles;
}

declare module 'virtual:notes' {
  const notes: import('./content/types').ArticleSummary[];
  export function loadArticle(slug: string): Promise<import('./content/types').ArticleBody>;
  export function loadSearch(): Promise<Record<string, string>>;
  export default notes;
}
