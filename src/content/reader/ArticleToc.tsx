import { useEffect, useRef, useState, type RefObject } from 'react';
import { useActiveHeading } from './useActiveHeading';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Icon from '../../components/Icon';
import type { Article } from '../types';

export default function ArticleToc({
  headings,
  bodyRef,
}: {
  headings: Article['headings'];
  bodyRef: RefObject<HTMLElement | null>;
}) {
  const activeHeading = useActiveHeading(bodyRef, headings);
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
            <Icon name="arrow" />
          </summary>
          <ol ref={listRef}>
            {headings.map((heading) => (
              <li className={heading.level === 3 ? 'toc-subheading' : undefined} key={heading.id}>
                <a
                  href={`#${encodeURIComponent(heading.id)}`}
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
