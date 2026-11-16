import { collapse, type Stretch } from './textMap.ts';

/**
 * A quoted passage as a link carries it, after `#quote=`: the passage whole, or its opening
 * and closing words when it is long, and which match it is when the words come up more than
 * once in the article.
 */
export interface Quote {
  start: string;
  end?: string;
  /** The passage is the nth match of `start`, counting from 1. */
  n: number;
}

const prefix = '#quote=';
/** Passages this long or shorter, once encoded, travel whole; longer ones by their ends. */
const wholeUpTo = 240;
/** Each end of a long passage: at most this many characters, and this long encoded. */
const edgeChars = 32;
const edgeEncoded = 96;

export const isQuoteHash = (hash: string) => hash.startsWith(prefix);

/**
 * Percent-encoding that chat apps and Markdown keep inside a link: no brackets, apostrophes
 * or final full stop, which they would read as the end of the address.
 */
const encode = (text: string) =>
  encodeURIComponent(text).replace(
    /[!'()*]|\.$/g,
    (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase(),
  );

const format = ({ start, end, n }: Quote) =>
  prefix + encode(start) + (end ? ',' + encode(end) : '') + (n > 1 ? '&n=' + n : '');

/** How many characters from the start of `chars` fit in one end of a long passage. */
function edgeLength(chars: readonly string[]) {
  let count = 0;
  let size = 0;
  for (const char of chars) {
    size += encode(char).length;
    if (count === edgeChars || size > edgeEncoded) break;
    count++;
  }
  return count;
}

/** Which match of `needle` begins at `at`, counting from 1. */
function occurrence(text: string, needle: string, at: number) {
  let n = 1;
  for (let index = text.indexOf(needle); index >= 0 && index < at; ) {
    n++;
    index = text.indexOf(needle, index + 1);
  }
  return n;
}

/** The passage of `text` the quote names, or nothing when the article no longer has it. */
export function findQuote(text: string, { start, end, n }: Quote): Stretch | undefined {
  // Past the last match, as after an edit, the last match stands in.
  let at = -1;
  for (let count = 0; count < n; count++) {
    const next = text.indexOf(start, at + 1);
    if (next < 0) break;
    at = next;
  }
  if (at < 0) return undefined;
  if (end === undefined) return { from: at, to: at + start.length };
  const close = text.indexOf(end, at + start.length);
  return close < 0 ? undefined : { from: at, to: close + end.length };
}

/** The link fragment for the passage of `text` from `from` to `to`. */
export function quoteHash(text: string, { from, to }: Stretch) {
  const passage = text.slice(from, to);
  const whole = () => format({ start: passage, n: occurrence(text, passage, from) });
  if (encode(passage).length <= wholeUpTo) return whole();
  const chars = Array.from(passage);
  const start = chars.slice(0, edgeLength(chars)).join('').trimEnd();
  const end = chars
    .slice(chars.length - edgeLength([...chars].reverse()))
    .join('')
    .trimStart();
  const hash = format({ start, end, n: occurrence(text, start, from) });
  // Closing words that come up earlier inside the passage would end it there.
  const found = findQuote(text, parseQuote(hash)!);
  return found?.from === from && found.to === to ? hash : whole();
}

export function parseQuote(hash: string): Quote | undefined {
  if (!isQuoteHash(hash)) return undefined;
  const [passage, ...options] = hash.slice(prefix.length).split('&');
  const ends = passage.split(',');
  if (ends.length > 2) return undefined;
  let start: string;
  let end: string | undefined;
  try {
    [start, end] = ends.map((part) => collapse(decodeURIComponent(part)));
  } catch {
    return undefined;
  }
  if (!start || end === '') return undefined;
  const n = Number(options.find((option) => option.startsWith('n='))?.slice(2) ?? 1);
  return { start, end, n: Number.isInteger(n) && n > 0 ? n : 1 };
}
