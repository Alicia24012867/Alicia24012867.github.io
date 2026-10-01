export interface ArticleSummary {
  slug: string;
  title: string;
  date: string;
  updated: string;
  pin: boolean;
  description: string;
  author?: string;
  email?: string;
  tags: string[];
  section: string;
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
