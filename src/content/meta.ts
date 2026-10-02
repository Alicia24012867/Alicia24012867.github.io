import type { ArticleSummary } from './types';
// The .ts extension keeps this module importable by the Node test runner.
import { absoluteUrl, articlePath, collectionBase, type Collection } from './urls.ts';

export interface ContentPageMeta {
  title: string;
  description: string;
  canonical: string;
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
  origin = window.location.origin,
}: {
  section: Collection;
  slug?: string;
  summary?: ArticleSummary;
  titles: { listing: string; missing: string; suffix: string };
  description: string;
  origin?: string;
}): ContentPageMeta {
  const meta = {
    title: summary ? summary.title + titles.suffix : slug ? titles.missing : titles.listing,
    description: summary?.description || description,
    canonical: absoluteUrl(
      summary ? articlePath(section, summary.slug) : collectionBase[section],
      origin,
    ),
  };
  if (!summary?.share) return meta;
  return {
    ...meta,
    image: absoluteUrl(summary.share.image, origin),
    imageAlt: 'Share card for ' + summary.title,
  };
}
