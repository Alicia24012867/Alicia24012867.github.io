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
  /** Language of the body (`zh-CN` or `en`), from front matter or counted from its prose. */
  lang: string;
  readingMinutes: number;
  /** Chinese characters plus English words, as shown next to the reading estimate. */
  wordCount: number;
  hasMath: boolean;
  /** Static share address and card, added by the content plugin when enabled. */
  share?: { path: string; image: string };
  /**
   * A locked document's sealed file. Until the password opens it, its entry gives only its
   * title, dates and section, with nothing for the rest.
   */
  locked?: string;
}

export interface ArticleBody {
  html: string;
  backlinks: string[];
  headings: { id: string; text: string; level: number }[];
  /** A locked document's attachments: each sealed file's own name, by its address. */
  files?: Record<string, string>;
}

export interface Article extends ArticleSummary, ArticleBody {}
