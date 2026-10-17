import { qrCode, type QrCode } from './qr.ts';

/**
 * A quoted passage as a picture to keep or post: the sky of the site's share cards above,
 * the passage below in the site's type, where it comes from, and a code leading back to it.
 */
export interface QuoteCardText {
  /** The small capitals above the passage, as the document's header has them. */
  eyebrow: string;
  passage: string;
  title: string;
  author: string;
  site: string;
  /** Where the code leads: the first address whose code is coarse enough to scan. */
  links: string[];
}

/** Measures text at the size it is about to be drawn. */
type Measure = (text: string) => number;

const cjk = /[⺀-〿぀-ヿ㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]/;
// Punctuation that never begins a line, and punctuation that never ends one.
const closing = new Set([...'，。、；：！？）》」』】〕〉”’…—～·%,.;:!?)]}']);
const opening = new Set([...'（《「『【〔〈“‘([{']);

/**
 * The text cut where a line may break: after a space, and before or after a Chinese or
 * Japanese character, but never before closing punctuation or after opening punctuation.
 */
export function breakUnits(text: string) {
  const units: string[] = [];
  let unit = '';
  let previous = '';
  for (const char of text) {
    if (
      unit &&
      char !== ' ' &&
      !closing.has(char) &&
      !opening.has(previous) &&
      (previous === ' ' || cjk.test(char) || cjk.test(previous))
    ) {
      units.push(unit);
      unit = '';
    }
    unit += char;
    previous = char;
  }
  if (unit) units.push(unit);
  return units;
}

/** Lines no wider than `width`; a word wider than a whole line is cut where it must be. */
export function wrapLines(text: string, width: number, measure: Measure) {
  const lines: string[] = [];
  const fits = (line: string) => measure(line.trimEnd()) <= width;
  let line = '';
  for (const unit of breakUnits(text)) {
    if (fits(line + unit)) {
      line += unit;
      continue;
    }
    if (line) lines.push(line.trimEnd());
    line = '';
    for (const char of unit) {
      if (line && !fits(line + char)) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/** A line shortened until it ends in an ellipsis within `width`. */
export function ellipsize(line: string, width: number, measure: Measure) {
  const chars = Array.from(line);
  const shortened = () => chars.join('').replace(/[\s，。、；：,.;:]+$/, '') + '…';
  while (chars.length && measure(shortened()) > width) chars.pop();
  return shortened();
}

/** The line as it is when it fits in `width`, else shortened to an ellipsis. */
export const fitLine = (line: string, width: number, measure: Measure) =>
  measure(line) <= width ? line : ellipsize(line, width, measure);

/**
 * The largest of `sizes` at which `text` fits in the lines `room` allows at that size; at
 * the smallest, as many lines as there is room for, the last ending in an ellipsis.
 */
export function fitText(
  text: string,
  sizes: readonly number[],
  width: number,
  room: (size: number) => number,
  measureAt: (size: number) => Measure,
) {
  let size = sizes[0];
  let lines: string[] = [];
  for (size of sizes) {
    lines = wrapLines(text, width, measureAt(size));
    if (lines.length <= room(size)) return { size, lines };
  }
  const most = room(size);
  lines = lines.slice(0, most);
  lines[most - 1] = ellipsize(lines[most - 1], width, measureAt(size));
  return { size, lines };
}

/** Modules across the densest code that still scans from the card once a feed shrinks it. */
const densest = 45;

/** The code for the first of `links` coarse enough to scan off the card, else the last. */
export function cardCode(links: readonly string[]): QrCode {
  let code = qrCode(links[0]);
  for (const link of links.slice(1)) {
    if (code.size <= densest) break;
    code = qrCode(link);
  }
  return code;
}

export const cardWidth = 1080;
export const cardHeight = 1440;
const margin = 84;
const column = cardWidth - margin * 2;
// The share cards' day colours, and the home page's night: the same sky, dimmed, over a
// deep blue wash. The code keeps dark modules on a light tile either way, for cameras.
const palettes = {
  day: {
    page: '#f5faff',
    wash: '245 250 255',
    eyebrow: '#5286b4',
    title: '#2e6fa8',
    passage: '#34506d',
    mark: '#c4dbef',
    signature: '#527697',
    site: '#6493b6',
    rule: '#d6e6f4',
    tile: '#fff',
    code: '#203b58',
  },
  night: {
    page: '#16283e',
    wash: '22 40 62',
    eyebrow: '#a8c6df',
    title: '#9cc8f0',
    passage: '#d3e3f3',
    mark: '#34547a',
    signature: '#a4c9ed',
    site: '#93abc2',
    rule: '#2a3d55',
    tile: '#dceafa',
    code: '#142338',
  },
};
// Where the sky gives way to the page.
const skyFades = { from: 300, to: 620 };
// Below the sky, the quotation mark, the passage and its source share this stretch: a long
// passage fills it, a short one sits a little above its middle in larger type.
const textArea = { top: 596, bottom: 1188 };
const markSpace = 94;
const sourceGap = 76;
const passageSizes = [64, 58, 52, 47, 43, 39, 35, 32, 29];
const lineHeight = 1.72;
const ruleY = 1232;
/** From the top of the mark to the foot of the source, around `lines` lines of `size`. */
const blockHeight = (size: number, lines: number) =>
  markSpace + size * 1.1 + (lines - 1) * size * lineHeight + sourceGap + 12;

const imageAt = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

/** A few faint stars over the dark left of the night sky, and a shooting star crossing it. */
function drawNightSky(context: CanvasRenderingContext2D) {
  // The same sky every time.
  let seed = 11;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  context.save();
  context.fillStyle = '#e8f1ff';
  context.shadowColor = '#d8e6ffcc';
  for (let i = 0; i < 28; i++) {
    const x = 24 + random() * cardWidth * 0.56;
    const y = 24 + random() * 400;
    const radius = 0.8 + random() * 1.5;
    const alpha = 0.3 + random() * 0.6;
    // The eyebrow keeps a clear band.
    if (y > 78 && y < 136 && x < 560) continue;
    context.globalAlpha = alpha;
    context.shadowBlur = i % 5 === 0 ? 8 : 0;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  // As on the home page: a bright head leading, its tail fading toward the upper right.
  const head = { x: 318, y: 226 };
  const angle = (22 * Math.PI) / 180;
  const tail = { x: head.x + Math.cos(angle) * 176, y: head.y - Math.sin(angle) * 176 };
  const streak = context.createLinearGradient(head.x, head.y, tail.x, tail.y);
  streak.addColorStop(0, '#fff');
  streak.addColorStop(0.28, '#cfe0ffa6');
  streak.addColorStop(1, '#cfe0ff00');
  context.globalAlpha = 1;
  context.shadowBlur = 0;
  context.strokeStyle = streak;
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(head.x, head.y);
  context.lineTo(tail.x, tail.y);
  context.stroke();
  context.fillStyle = '#fff';
  context.shadowColor = '#d8e6ffcc';
  context.shadowBlur = 16;
  context.beginPath();
  context.arc(head.x, head.y, 4, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/**
 * Draws the card and returns it as a PNG. `fonts.body` and `fonts.display` are the page's
 * font stacks; the sky is the picture the site's share cards are made from, at night dimmed
 * as the home page dims it.
 */
export async function drawQuoteCard(
  text: QuoteCardText,
  fonts: { body: string; display: string },
  { night = false, sky = '/images/summer-sky.webp' } = {},
) {
  const ink = night ? palettes.night : palettes.day;
  const wash = (alpha: number) => `rgb(${ink.wash} / ${alpha})`;
  const canvas = document.createElement('canvas');
  canvas.width = cardWidth;
  canvas.height = cardHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas to draw the card on');
  const body = (size: number, weight = 400) => `${weight} ${size}px ${fonts.body}`;
  // Playfair Display comes in italics only, which its Latin letters take; Chinese titles keep
  // the upright brush script the site shows them in.
  const display = (size: number) => `400 ${size}px ${fonts.display}`;
  const [image] = await Promise.all([
    imageAt(sky),
    // A font that fails to load leaves its fallback in its place.
    document.fonts.load(body(40), text.passage + text.site + text.eyebrow).catch(() => []),
    document.fonts.load(display(40), '“' + text.title + text.author).catch(() => []),
  ]);

  context.fillStyle = ink.page;
  context.fillRect(0, 0, cardWidth, cardHeight);
  if (image) {
    // As wide as the card and anchored at the top, like the homepage hero.
    const skyHeight = (image.height * cardWidth) / image.width;
    context.drawImage(image, 0, 0, cardWidth, skyHeight);
    if (night) {
      // The home page's brightness(0.64) saturate(0.72), in blends every canvas has.
      context.globalCompositeOperation = 'saturation';
      context.globalAlpha = 0.28;
      context.fillStyle = '#808080';
      context.fillRect(0, 0, cardWidth, skyHeight);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'multiply';
      context.fillStyle = 'rgb(163 163 163)';
      context.fillRect(0, 0, cardWidth, skyHeight);
      context.globalCompositeOperation = 'source-over';
    }
    const left = context.createLinearGradient(0, 0, cardWidth * 0.62, 0);
    left.addColorStop(0, wash(night ? 0.9 : 0.82));
    left.addColorStop(0.55, wash(night ? 0.62 : 0.5));
    left.addColorStop(1, wash(0));
    context.fillStyle = left;
    context.fillRect(0, 0, cardWidth, skyFades.to);
  }
  if (night) drawNightSky(context);
  const fade = context.createLinearGradient(0, skyFades.from, 0, skyFades.to);
  fade.addColorStop(0, wash(0));
  fade.addColorStop(0.6, wash(0.86));
  fade.addColorStop(1, ink.page);
  context.fillStyle = fade;
  context.fillRect(0, skyFades.from, cardWidth, cardHeight - skyFades.from);

  context.textBaseline = 'alphabetic';
  // The eyebrow, with the fine rule the share cards open with.
  context.fillStyle = ink.eyebrow;
  context.fillRect(margin, 107, 30, 2);
  context.font = body(23, 500);
  context.letterSpacing = '3.5px';
  context.fillText(
    fitLine(text.eyebrow, column - 48, (line) => context.measureText(line).width),
    margin + 48,
    116,
  );
  context.letterSpacing = '0px';

  const area = textArea.bottom - textArea.top;
  const passage = fitText(
    text.passage,
    passageSizes,
    column,
    (size) => 1 + Math.floor((area - blockHeight(size, 1)) / (size * lineHeight)),
    (size) => {
      context.font = body(size);
      return (line) => context.measureText(line).width;
    },
  );
  const spare = area - blockHeight(passage.size, passage.lines.length);
  const passageTop = textArea.top + Math.max(0, spare * 0.42) + markSpace;

  context.fillStyle = ink.mark;
  context.font = display(170);
  context.fillText('“', margin - 10, passageTop + 30);

  context.font = body(passage.size);
  context.fillStyle = ink.passage;
  const step = passage.size * lineHeight;
  // The first line's letters start at the top of its line, the rest one line apart.
  const firstBaseline = passageTop + passage.size * 1.1;
  passage.lines.forEach((line, i) => context.fillText(line, margin, firstBaseline + i * step));

  context.font = display(36);
  context.fillStyle = ink.title;
  context.fillText(
    fitLine('— ' + text.title, column, (line) => context.measureText(line).width),
    margin,
    firstBaseline + (passage.lines.length - 1) * step + sourceGap,
  );

  context.fillStyle = ink.rule;
  context.fillRect(margin, ruleY, column, 2);
  context.fillStyle = ink.signature;
  context.font = display(52);
  context.fillText(text.author, margin, ruleY + 88);
  context.fillStyle = ink.site;
  context.font = body(24);
  context.fillText(text.site, margin, ruleY + 140);

  // The code on a light tile, with the light margin a reader needs around it.
  const code = cardCode(text.links);
  const tile = 156;
  const tileLeft = cardWidth - margin - tile;
  const tileTop = ruleY + 26;
  context.fillStyle = ink.tile;
  context.beginPath();
  context.roundRect(tileLeft, tileTop, tile, tile, 14);
  context.fill();
  const unit = tile / (code.size + 8);
  // Edges rounded to whole pixels, so neighbouring modules meet without seams.
  const edge = (offset: number, modules: number) => Math.round(offset + (modules + 4) * unit);
  context.fillStyle = ink.code;
  for (let y = 0; y < code.size; y++)
    for (let x = 0; x < code.size; x++) {
      if (!code.dark(x, y)) continue;
      const left = edge(tileLeft, x);
      const top = edge(tileTop, y);
      context.fillRect(left, top, edge(tileLeft, x + 1) - left, edge(tileTop, y + 1) - top);
    }

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The card could not be encoded'))),
      'image/png',
    ),
  );
}
