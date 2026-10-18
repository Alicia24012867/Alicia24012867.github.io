import type { ArticleSummary } from './types';
import { blogFeed } from '../config/feeds.mjs';
import { lockedDescription } from '../config/locked.mjs';
// The .ts extension keeps this module importable by the Node test runner.
import { absoluteUrl, articlePath, collectionBase, type Collection } from './urls.ts';

export interface ContentPageMeta {
  title: string;
  description: string;
  canonical: string;
  type: 'article' | 'website';
  image?: string;
  imageAlt?: string;
}

/** Document head for a listing, a missing document or one selected document. */
export function contentPageMeta({
  section,
  slug,
  summary,
  titles,
  description,
  origin = blogFeed.siteUrl,
}: {
  section: Collection;
  slug?: string;
  summary?: ArticleSummary;
  titles: { listing: string; missing: string; suffix: string };
  description: string;
  origin?: string;
}): ContentPageMeta {
  const meta: ContentPageMeta = {
    type: summary ? 'article' : 'website',
    title: summary ? summary.title + titles.suffix : slug ? titles.missing : titles.listing,
    description: summary?.locked ? lockedDescription(section) : summary?.description || description,
    canonical: absoluteUrl(
      summary ? articlePath(section, summary.slug) : collectionBase[section],
      origin,
    ),
  };
  // A locked document's page keeps the site's card, which its static page already names.
  if (!summary?.share || summary.locked) return meta;
  return {
    ...meta,
    image: absoluteUrl(summary.share.image, origin),
    imageAlt: 'Share card for ' + summary.title,
  };
}
