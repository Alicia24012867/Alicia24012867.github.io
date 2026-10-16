import type { Stretch } from './textMap.ts';

/** What choosing a voice looks at, of the voices a browser lists. */
export interface VoiceInfo {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

const tagOf = (lang: string) => lang.replaceAll('_', '-').toLowerCase();
/** Voices for Mandarin (`cmn`) and Cantonese (`yue`) read Chinese text too. */
const languageOf = (tag: string) => {
  const language = tag.split('-')[0];
  return language === 'cmn' || language === 'yue' ? 'zh' : language;
};
/** Cantonese reads Chinese in another spoken language than the usual Mandarin. */
const isCantonese = (tag: string) => /^(yue|zh-(hk|mo|yue))(-|$)/.test(tag);
/** The region a language is usually read in, when neither the text nor the reader names one. */
const usual: Record<string, string> = { en: 'en-us', zh: 'zh-cn' };

/** Sound effects and characters that macOS lists among its voices. */
const novelty =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/;
/** Robotic voices kept for old software, chosen only when no other reads the language. */
const dated = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Fred|Junior|Kathy|Ralph)\b/;
/** Fuller voices that systems offer online or as a larger download. */
const fuller = /\b(Natural|Neural|Premium|Enhanced)\b/i;

/**
 * The voice to read text in `lang` with, or undefined when none reads that language. A
 * fuller voice comes first, then the one the system speaks with, then one of the region
 * the text or the reader's own languages name, then one on the device, which works offline.
 */
export function voiceFor<V extends VoiceInfo>(
  voices: readonly V[],
  lang: string,
  readerLanguages: readonly string[] = [],
): V | undefined {
  const wanted = tagOf(lang);
  const language = languageOf(wanted);
  const regions = [wanted, ...readerLanguages.map(tagOf)];
  let best: V | undefined;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const tag = tagOf(voice.lang);
    if (languageOf(tag) !== language || novelty.test(voice.name)) continue;
    if (language === 'zh' && isCantonese(tag) !== isCantonese(wanted)) continue;
    const score =
      (fuller.test(voice.name) ? 8 : 0) +
      (voice.default ? 4 : 0) +
      (regions.includes(tag) ? 2 : tag === usual[language] ? 1 : 0) +
      (voice.localService ? 1 : 0) -
      (dated.test(voice.name) ? 16 : 0);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

const space = /\s/;
const speakable = /[\p{L}\p{N}]/u;
const opening = /[\p{Ps}\p{Pi}]/u;
/** Where a long sentence can pause for breath. */
const pause = /[,，、;；:：—–）)]/;

/** A text's sentences, as the browser divides them, or by their final punctuation. */
function sentences(text: string, lang: string): Stretch[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(lang, { granularity: 'sentence' });
    return Array.from(segmenter.segment(text), ({ index, segment }) => ({
      from: index,
      to: index + segment.length,
    }));
  }
  const found: Stretch[] = [];
  let from = 0;
  for (const end of text.matchAll(/[.!?]+[”’"')\]]*\s+|[。！？]+[”’"'）」』]*/gu)) {
    const to = end.index + end[0].length;
    found.push({ from, to });
    from = to;
  }
  if (from < text.length) found.push({ from, to: text.length });
  return found;
}

/** Where to cut a sentence too long to read in one go: after its last pause before `end`. */
function cut(text: string, start: number, end: number) {
  const least = start + Math.floor((end - start) / 3);
  for (let index = end - 1; index >= least; index--) if (pause.test(text[index])) return index + 1;
  for (let index = end; index > least; index--) if (space.test(text[index])) return index;
  // A character outside the basic plane is two code units: it stays whole.
  const code = text.charCodeAt(end - 1);
  return code >= 0xd800 && code <= 0xdbff ? end - 1 : end;
}

/**
 * The pieces to read a text aloud in, as stretches of it: its sentences, without spaces at
 * either end. A sentence longer than `limit` characters is cut after a comma or similar
 * pause, or at a space, so the mark on the page keeps up with the voice.
 */
export function sentencesOf(text: string, lang: string, limit = 220): Stretch[] {
  const pieces: Stretch[] = [];
  const add = (from: number, to: number) => {
    while (from < to && space.test(text[from])) from++;
    while (to > from && space.test(text[to - 1])) to--;
    if (speakable.test(text.slice(from, to))) pieces.push({ from, to });
  };
  const found = sentences(text, lang);
  // A bracket or quote left open at the end of a sentence opens the next one.
  for (let index = 0; index < found.length - 1; index++) {
    let start = found[index].to;
    while (start > found[index].from && space.test(text[start - 1])) start--;
    while (start > found[index].from && opening.test(text[start - 1])) start--;
    if (start < found[index].to && opening.test(text[start])) {
      found[index].to = start;
      found[index + 1].from = start;
    }
  }
  for (const { from, to } of found) {
    let start = from;
    while (to - start > limit) {
      const end = cut(text, start, start + limit);
      add(start, end);
      start = end;
      while (start < to && space.test(text[start])) start++;
    }
    add(start, to);
  }
  return pieces;
}

const symbols: Record<string, string> = {
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '~',
  times: '×',
  cdot: '·',
  div: '÷',
  pm: '±',
  in: '∈',
  notin: '∉',
  infty: '∞',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  ldots: '…',
  cdots: '…',
  dots: '…',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
};
/** Commands that only space a formula out or set how its letters look. */
const quiet = /^(quad|qquad|left|right|text|textrm|mathrm|mathit|mathbf|operatorname)$/;
const superscripts = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/**
 * How a short formula is read aloud: its TeX with each command written as the symbol it
 * draws, a power of digits raised and other scripts set apart, so `h_n \le 0.9 \times h^2`
 * reads as "h n ≤ 0.9 × h²". A formula of fractions, roots, sums or any other structure
 * has no such reading and is left unread.
 */
export function spokenTex(tex: string): string | undefined {
  if (tex.length > 60) return undefined;
  let readable = true;
  const spoken = tex
    .replace(/\\([a-zA-Z]+)\s*/g, (_, name: string) => {
      if (quiet.test(name)) return ' ';
      const symbol = symbols[name];
      if (symbol === undefined) readable = false;
      return ` ${symbol} `;
    })
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\([%#&$_])/g, '$1')
    .replace(/\^\{?(\d+)\}?/g, (_, digits: string) =>
      Array.from(digits, (digit) => superscripts[Number(digit)]).join(''),
    )
    .replace(/[{}_^]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return readable && spoken && !spoken.includes('\\') ? spoken : undefined;
}
