import type { ReactNode } from 'react';
import { matchesIn } from './search';

/** Text with every match of the search query marked. */
export default function Marked({ text, query }: { text: string; query: string }) {
  const spans = matchesIn(text, query);
  if (!spans.length) return text;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of spans) {
    parts.push(
      text.slice(at, start),
      <mark className="search-mark" key={start}>
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  parts.push(text.slice(at));
  return parts;
}
