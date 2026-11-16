import { useCallback, type RefObject } from 'react';
import ReaderPopover from './ReaderPopover';

/** The footnote a reference points to, without its back links or ids it would repeat. */
function footnoteFor(root: HTMLElement, reference: HTMLAnchorElement) {
  let id: string;
  try {
    id = decodeURIComponent(reference.hash.slice(1));
  } catch {
    return null;
  }
  const item = document.getElementById(id);
  const content = item && root.contains(item) && item.querySelector('.footnote-content');
  if (!content) return null;
  const copy = content.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.footnote-back').forEach((link) => link.closest('p')?.remove());
  copy.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  copy
    .querySelectorAll('[aria-describedby]')
    .forEach((element) => element.removeAttribute('aria-describedby'));
  // Screen readers already hear the note through the reference's aria-describedby.
  copy
    .querySelectorAll('a, button, input')
    .forEach((element) => element.setAttribute('tabindex', '-1'));
  return copy.innerHTML;
}

/**
 * Shows a footnote beside its reference: on hover, on keyboard focus, or on a tap, which
 * no longer jumps away from the text. Tapping the same reference again goes to the note.
 */
export default function FootnotePreview({
  bodyRef,
  slug,
}: {
  bodyRef: RefObject<HTMLElement | null>;
  slug: string;
}) {
  const render = useCallback(
    (reference: HTMLAnchorElement, close: () => void) => {
      const html = bodyRef.current && footnoteFor(bodyRef.current, reference);
      if (!html) return null;
      return (
        <>
          <p className="footnote-preview-label">Footnote {reference.textContent?.trim()}</p>
          <div
            className="footnote-preview-body article-body"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <a
            className="footnote-preview-jump"
            href={reference.getAttribute('href') ?? undefined}
            tabIndex={-1}
            onClick={close}
          >
            Go to footnote ↓
          </a>
        </>
      );
    },
    [bodyRef],
  );
  return (
    <ReaderPopover
      bodyRef={bodyRef}
      slug={slug}
      selector=".footnote-ref a"
      render={render}
      className="footnote-preview"
      tapToOpen
    />
  );
}
