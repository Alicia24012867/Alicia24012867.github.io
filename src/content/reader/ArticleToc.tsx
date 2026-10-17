import { useEffect, useRef, useState, type RefObject } from 'react';
import { countsDown, minutesLeft, readingProgress } from './progress';
import { useActiveHeading } from './useActiveHeading';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Icon from '../../components/Icon';
import { textLanguage } from '../language.mjs';
import type { Article } from '../types';

/** Minutes of reading left, kept up to date as the reader scrolls. */
function useMinutesLeft(bodyRef: RefObject<HTMLElement | null>, minutes: number) {
  const [left, setLeft] = useState<number>();
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !countsDown(minutes)) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const header = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
      const { top, height } = body.getBoundingClientRect();
      // The same number again leaves the contents as they are.
      setLeft(minutesLeft(minutes, readingProgress(top, height, Math.max(header, 0), innerHeight)));
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', schedule);
      removeEventListener('resize', schedule);
    };
  }, [bodyRef, minutes]);
  return left;
}

export default function ArticleToc({
  headings,
  bodyRef,
  minutes,
}: {
  headings: Article['headings'];
  bodyRef: RefObject<HTMLElement | null>;
  /** The estimated reading time of the whole document. */
  minutes: number;
}) {
  const activeHeading = useActiveHeading(bodyRef, headings);
  // Without headings there are no contents to show it in.
  const left = useMinutesLeft(bodyRef, headings.length ? minutes : 0);
  const listRef = useRef<HTMLOListElement>(null);
  // Phones show the contents collapsed above the article; wider screens keep it open beside it.
  const compact = useMediaQuery('(max-width: 760px)');
  const [expanded, setExpanded] = useState(false);
  const open = !compact || expanded;

  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !active || list.scrollHeight <= list.clientHeight) return;
    const bounds = list.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    // Scroll only the directory; scrollIntoView would also move the article viewport.
    if (item.top < bounds.top) list.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
  }, [activeHeading, headings]);

  if (!headings.length) return null;

  return (
    <aside className="article-toc">
      <nav aria-label="On this page">
        <details
          open={open}
          onToggle={(event) => {
            const details = event.currentTarget;
            if (compact) setExpanded(details.open);
            else if (!details.open) details.open = true;
          }}
        >
          <summary tabIndex={compact ? undefined : -1}>
            On this page
            {left !== undefined && <span className="toc-time-left">{left} min left</span>}
            <Icon name="arrow" />
          </summary>
          <ol ref={listRef}>
            {headings.map((heading) => (
              <li className={heading.level === 3 ? 'toc-subheading' : undefined} key={heading.id}>
                <a
                  href={`#${encodeURIComponent(heading.id)}`}
                  lang={textLanguage(heading.text)}
                  className={activeHeading === heading.id ? 'is-active' : undefined}
                  aria-current={activeHeading === heading.id ? 'location' : undefined}
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ol>
        </details>
      </nav>
      <div className="toc-note">
        <Icon name="cloud" />
        <span>
          Read a little. Reflect a little.
          <br />
          Keep your curiosity growing.
        </span>
      </div>
    </aside>
  );
}
