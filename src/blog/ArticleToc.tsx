import { useEffect, useRef } from 'react';
import Icon from '../Icons';
import type { Article } from './types';

export default function ArticleToc({ headings, activeHeading }: { headings: Article['headings']; activeHeading: string }) {
  const listRef = useRef<HTMLOListElement>(null);

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

  return <aside className="article-toc">
    <nav aria-label="本文目录">
      <p>本文目录<span>CONTENTS</span></p>
      <ol ref={listRef}>
        {headings.map(heading => <li className={heading.level === 3 ? 'toc-subheading' : undefined} key={heading.id}>
          <a href={`#${encodeURIComponent(heading.id)}`}
            className={activeHeading === heading.id ? 'is-active' : undefined}
            aria-current={activeHeading === heading.id ? 'location' : undefined}>
            {heading.text}
          </a>
        </li>)}
      </ol>
    </nav>
    <div className="toc-note"><Icon name="cloud"/><span>读一点，想一点。<br/>让好奇心继续生长。</span></div>
  </aside>;
}
