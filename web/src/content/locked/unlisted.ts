import { lockedTitle } from '../../config/locked.mjs';
import { articlePath, type Collection } from '../urls';
import type { ArticleSummary } from '../types';

/**
 * An unlisted locked document is in no listing: only its own page names its sealed file, and
 * everything else about it, its title too, stays sealed until the password opens it.
 */
export function unlistedSummary(collection: Collection, slug: string): ArticleSummary | undefined {
  const locked = document.querySelector('meta[name="locked-article"]')?.getAttribute('content');
  if (!locked) return undefined;
  const image = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
  return {
    slug,
    title: lockedTitle(collection),
    date: '',
    updated: '',
    pin: false,
    description: '',
    tags: [],
    section: '',
    format: 'Markdown',
    lang: '',
    readingMinutes: 0,
    wordCount: 0,
    hasMath: false,
    share: { path: articlePath(collection, slug), image: image ?? '' },
    locked,
  };
}
