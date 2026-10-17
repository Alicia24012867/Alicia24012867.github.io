/**
 * An article's prose as one string, for finding a quoted passage or a search term in it:
 * every run of whitespace is a single space, and blocks such as paragraphs are set apart by
 * one. Formulas, diagrams, interactive figures and controls are left out, as their text is
 * not prose a reader quotes. Each text node remembers where its characters went, so a
 * stretch of the string maps back to the page and a selection maps to a stretch of it.
 */

export interface Piece<T> {
  node: T;
  /** Where each of the node's characters went in the string; -1 for collapsed whitespace. */
  at: Int32Array;
  /** Where its first kept character went, or would have. */
  start: number;
}

export interface FlatText<T> {
  text: string;
  pieces: Piece<T>[];
}

export interface Part<T> {
  node: T;
  text: string;
  /** Whether the part begins a new block, or a new line within one. */
  gap: boolean;
}

export type Stretch = { from: number; to: number };

const space = /\s/;

export function flatten<T>(parts: Iterable<Part<T>>): FlatText<T> {
  let text = '';
  const pieces: Piece<T>[] = [];
  for (const part of parts) {
    if (part.gap && text && !text.endsWith(' ')) text += ' ';
    const start = text.length;
    const at = new Int32Array(part.text.length);
    for (let index = 0; index < part.text.length; index++) {
      const char = part.text[index];
      if (!space.test(char)) {
        at[index] = text.length;
        text += char;
      } else if (text && !text.endsWith(' ')) {
        at[index] = text.length;
        text += ' ';
      } else at[index] = -1;
    }
    pieces.push({ node: part.node, at, start });
  }
  return { text, pieces };
}

/** Whitespace as the flattened text writes it. */
export const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The stretch of the string that `covered` marks out, without spaces at its ends.
 * `covered(node)` gives the part of a node's characters inside the selection, if any.
 */
export function stretchOf<T>(
  flat: FlatText<T>,
  covered: (node: T) => readonly [number, number] | undefined,
): Stretch | undefined {
  let from = -1;
  let to = -1;
  for (const piece of flat.pieces) {
    const span = covered(piece.node);
    if (!span) continue;
    for (let index = span[0]; index < span[1]; index++) {
      const at = piece.at[index];
      if (at < 0) continue;
      if (from < 0) from = at;
      to = at + 1;
    }
  }
  if (from < 0) return undefined;
  while (from < to && flat.text[from] === ' ') from++;
  while (to > from && flat.text[to - 1] === ' ') to--;
  return from < to ? { from, to } : undefined;
}

/** The node and offset of the character at `index` of the string. */
export function pointOf<T>(flat: FlatText<T>, index: number) {
  // Pieces start in order: the character belongs to the last one starting at or before it.
  let low = 0;
  let high = flat.pieces.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (flat.pieces[middle].start <= index) low = middle;
    else high = middle - 1;
  }
  const piece = flat.pieces[low];
  const offset = piece ? piece.at.indexOf(index) : -1;
  return offset >= 0 ? { node: piece.node, offset } : undefined;
}

/** Text that is not prose: formulas, diagrams, interactive figures, controls, note marks. */
const skipped = [
  '.katex',
  '.article-mermaid',
  'figure[data-figure]',
  '.copy-code',
  '.heading-link',
  '.footnote-ref',
  '.footnote-back',
  'button',
  'svg',
  'script',
  'style',
  'template',
  '[hidden]',
].join(', ');
/** Elements whose text stands apart from the text around them. */
export const blocks =
  'address, article, aside, blockquote, caption, dd, details, div, dl, dt, figcaption, figure, footer, h1, h2, h3, h4, h5, h6, header, li, ol, p, pre, section, summary, table, tbody, td, tfoot, th, thead, tr, ul';

export function articleText(root: HTMLElement): FlatText<Text> {
  const parts: Part<Text>[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node instanceof Element && node.matches(skipped)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  let block: Element | undefined;
  let lineBreak = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Element) {
      if (node.matches('br, hr')) lineBreak = true;
      continue;
    }
    const text = node as Text;
    if (!text.data) continue;
    const owner = text.parentElement?.closest(blocks) ?? root;
    parts.push({ node: text, text: text.data, gap: lineBreak || owner !== block });
    block = owner;
    lineBreak = false;
  }
  return flatten(parts);
}

/**
 * The text a range takes in, set out as `articleText` sets it out, but with each formula
 * the range touches written whole by `write` from its TeX instead of left out.
 */
export function textWithFormulas(root: HTMLElement, range: Range, write: (tex: string) => string) {
  const parts: Part<Node>[] = [];
  const covered = coveredBy(range);
  let block: Element | undefined;
  let lineBreak = false;
  const add = (node: Node, text: string, from: Element) => {
    const owner = from.closest(blocks) ?? root;
    parts.push({ node, text, gap: lineBreak || owner !== block });
    block = owner;
    lineBreak = false;
  };
  const visit = (parent: Node) => {
    for (const node of parent.childNodes) {
      if (node instanceof Text) {
        const span = covered(node);
        if (span && node.parentElement) add(node, node.data.slice(...span), node.parentElement);
      } else if (node instanceof Element) {
        if (node.matches('.katex')) {
          const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
          if (tex != null && range.intersectsNode(node)) add(node, write(tex), node);
        } else if (node.matches('br, hr')) lineBreak = true;
        else if (!node.matches(skipped)) visit(node);
      }
    }
  };
  visit(root);
  return collapse(flatten(parts).text);
}

/** The characters of each text node that a range takes in. */
export const coveredBy = (range: Range) => (node: Text) => {
  if (!range.intersectsNode(node)) return undefined;
  const start = node === range.startContainer ? range.startOffset : 0;
  const end = node === range.endContainer ? range.endOffset : node.length;
  return start < end ? ([start, end] as const) : undefined;
};

/**
 * A range over a stretch of the article's text. An element in place of a text node, such as
 * a formula read aloud, is taken in whole.
 */
export function rangeOf(flat: FlatText<Node>, { from, to }: Stretch) {
  const start = pointOf(flat, from);
  const end = pointOf(flat, to - 1);
  if (!start || !end) return undefined;
  const range = document.createRange();
  if (start.node instanceof Text) range.setStart(start.node, start.offset);
  else range.setStartBefore(start.node);
  if (end.node instanceof Text) range.setEnd(end.node, end.offset + 1);
  else range.setEndAfter(end.node);
  return range;
}
