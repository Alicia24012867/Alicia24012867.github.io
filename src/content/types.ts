export type ArticleSectionId = 'learn' | 'life';

export interface ArticleSummary {
  slug: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  section: ArticleSectionId;
  format: 'Markdown' | 'HTML';
  readingMinutes: number;
  hasMath: boolean;
}

export interface ArticleBody {
  html: string;
  backlinks: string[];
  headings: { id: string; text: string; level: number }[];
}

export interface Article extends ArticleSummary, ArticleBody {}
