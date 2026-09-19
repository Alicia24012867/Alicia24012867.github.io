export type ArticleSectionId = 'learn' | 'life';

export interface Article {
  slug: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  section: ArticleSectionId;
  format: 'Markdown' | 'HTML';
  readingMinutes: number;
  html: string;
  headings: { id: string; text: string; level: number }[];
}
