import { useCallback, type RefObject } from 'react';
import ReaderPopover from './ReaderPopover';
import { linkedDocument } from './links';
import type { Collection } from '../urls';
import type { ArticleSummary } from '../types';

/** The documents a reader can preview: its own collection, from the summaries it has. */
export type LinkPreviewSource = {
  collection: Collection;
  find: (slug: string) => ArticleSummary | undefined;
  section: (summary: ArticleSummary) => string;
};

/**
 * Hovering or focusing a link to another post or note shows its card, title and summary.
 * Taps still follow links straight away.
 */
export default function LinkPreview({
  bodyRef,
  slug,
  source,
}: {
  bodyRef: RefObject<HTMLElement | null>;
  slug: string;
  source: LinkPreviewSource;
}) {
  const render = useCallback(
    (link: HTMLAnchorElement) => {
      if (link.closest('.footnote-ref') || link.querySelector('img')) return null;
      const target = linkedDocument(link.href, window.location.href, source.collection);
      const summary = target && source.find(target);
      if (!summary) return null;
      const details = [
        source.section(summary),
        summary.date.slice(0, 10),
        summary.locked ? 'Locked' : `${summary.readingMinutes} min read`,
      ];
      return (
        <>
          {summary.share && (
            <img
              className="link-preview-image"
              src={summary.share.image}
              alt=""
              width="1200"
              height="630"
              decoding="async"
            />
          )}
          <div className="link-preview-text">
            <p className="link-preview-meta">{details.filter(Boolean).join(' · ')}</p>
            <p className="link-preview-title article-title">{summary.title}</p>
            {summary.description && (
              <p className="link-preview-description">{summary.description}</p>
            )}
          </div>
        </>
      );
    },
    [source],
  );
  return (
    <ReaderPopover
      bodyRef={bodyRef}
      slug={slug}
      selector="a[href]"
      render={render}
      className="link-preview"
      delay={300}
    />
  );
}
