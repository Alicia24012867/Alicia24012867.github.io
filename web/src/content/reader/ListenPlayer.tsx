import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import Icon from '../../components/Icon';
import { holdMusic } from '../../components/music/music';
import { textLanguage } from '../language.mjs';
import type { Article } from '../types';
import { canSpeak, listening } from './listening';
import { sentencesOf, spokenTex, voiceFor } from './speech';
import { blocks, flatten, rangeOf, type Part } from './textMap';

/** A sentence or so to read aloud, where it is on the page, and the section it is in. */
type Line = { text: string; lang: string; range: Range; section?: string };
type Session = {
  lines: Line[];
  index: number;
  /** Counts the lines begun, so the events of one cut short can be told apart. */
  turn: number;
  voices: Map<string, SpeechSynthesisVoice | undefined>;
  /** Held so the browser cannot collect a line before it ends, and lose its end. */
  utterance?: SpeechSynthesisUtterance;
};

const rates = [1, 1.25, 1.5, 2, 0.75];
const rateKey = 'alicia-listen-rate';

function savedRate() {
  try {
    const rate = Number(window.localStorage.getItem(rateKey));
    return rates.includes(rate) ? rate : 1;
  } catch {
    return 1;
  }
}
function saveRate(rate: number) {
  try {
    if (rate === 1) window.localStorage.removeItem(rateKey);
    else window.localStorage.setItem(rateKey, String(rate));
  } catch {
    // Without storage, the speed lasts as long as the page.
  }
}

/** What reading aloud passes over: code, tables, pictures, diagrams, footnotes and controls. */
const unread = [
  'pre',
  'table',
  'figure',
  'img',
  'svg',
  '.katex-display',
  '.article-footnotes',
  '.footnote-ref',
  '.footnote-back',
  '.copy-code',
  '.heading-link',
  'button',
  'script',
  'style',
  'template',
  '[hidden]',
  '[aria-hidden="true"]',
  'details:not([open]) > :not(summary)',
].join(', ');
const han = /\p{Script=Han}/u;

/**
 * The lines to read `root` aloud in. Each block of text is read in its own language: in a
 * Chinese document, any block with Chinese in it is read by a Chinese voice, which reads
 * English words too, and otherwise the language with more words in the block reads it.
 */
function linesOf(root: Element, lang: string): Line[] {
  const groups: { owner: Element; parts: Part<Node>[] }[] = [];
  let lineBreak = false;
  const add = (node: Node, text: string, from: Element) => {
    const owner = from.closest(blocks) ?? root;
    const last = groups.at(-1);
    if (last?.owner === owner) last.parts.push({ node, text, gap: lineBreak });
    else groups.push({ owner, parts: [{ node, text, gap: false }] });
    lineBreak = false;
  };
  const visit = (parent: Node) => {
    for (const node of parent.childNodes) {
      if (node instanceof Text) {
        if (node.data && node.parentElement) add(node, node.data, node.parentElement);
      } else if (node instanceof Element && !node.matches(unread)) {
        if (node.matches('.katex')) {
          const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
          const spoken = tex == null ? undefined : spokenTex(tex);
          if (spoken) add(node, ` ${spoken} `, node);
        } else if (node.matches('br, hr')) lineBreak = true;
        else visit(node);
      }
    }
  };
  visit(root);

  const chinese = /^zh\b/i.test(lang);
  const mixed = chinese || /^en\b/i.test(lang);
  const lines: Line[] = [];
  let section: string | undefined;
  for (const { owner, parts } of groups) {
    const flat = flatten(parts);
    if (!flat.text.trim()) continue;
    if (owner.matches('h2, h3')) section = flat.text.trim();
    const marked = owner.closest('[lang]');
    const language =
      marked && marked !== root && root.contains(marked)
        ? marked.getAttribute('lang')!
        : !mixed
          ? lang
          : chinese && han.test(flat.text)
            ? 'zh-CN'
            : textLanguage(flat.text);
    for (const stretch of sentencesOf(flat.text, language)) {
      const range = rangeOf(flat, stretch);
      if (range)
        lines.push({
          text: flat.text.slice(stretch.from, stretch.to),
          lang: language,
          range,
          section,
        });
    }
  }
  return lines;
}

const viewTop = () =>
  Math.max(document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0, 0);
/** The foot of the screen, which the player covers. */
const playerRoom = 96;
const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

const inSight = (range: Range) => {
  const box = range.getBoundingClientRect();
  return box.height > 0 && box.bottom > viewTop() && box.top < window.innerHeight;
};
const firstInSight = (lines: Line[]) => lines.findIndex((line) => inSight(line.range));

/** Scrolls a line a third of the way down the screen, unless it is in full view already. */
function bringIntoSight(range: Range) {
  const box = range.getBoundingClientRect();
  if (!box.height) return;
  const top = viewTop();
  const bottom = window.innerHeight - playerRoom;
  if (box.top >= top + 12 && box.bottom <= bottom) return;
  window.scrollTo({ top: Math.max(0, window.scrollY + box.top - top - (bottom - top) / 3) });
}

const highlights = () =>
  typeof CSS !== 'undefined' && 'highlights' in CSS ? CSS.highlights : undefined;

/**
 * Reads the document aloud with a voice of the browser, from the first line on screen, and
 * marks the sentence being read. The page follows the voice while the reader keeps it in
 * sight, and stays put once they scroll elsewhere; paused there, it reads on from what is
 * on screen. Code, tables, pictures and footnotes are passed over, and so are formulas too
 * intricate to say.
 */
export default function ListenPlayer({
  bodyRef,
  article,
}: {
  bodyRef: RefObject<HTMLElement | null>;
  article: Article;
}) {
  const { status } = useSyncExternalStore(listening.subscribe, listening.get);
  const [section, setSection] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [rate, setRate] = useState(savedRate);
  const speed = useRef(rate);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root || !canSpeak()) return;
    const synth = window.speechSynthesis;
    let session: Session | undefined;
    // When the reader last scrolled by hand.
    let moved = -Infinity;

    const offer = () => {
      const voices = synth.getVoices();
      // Until the browser lists its voices, it is not known whether one reads the language.
      if (voices.length)
        listening.update({
          available: !!voiceFor(voices, article.lang, navigator.languages),
        });
    };
    const voiceOf = (current: Session, lang: string) => {
      if (!current.voices.has(lang))
        current.voices.set(lang, voiceFor(synth.getVoices(), lang, navigator.languages));
      return current.voices.get(lang);
    };

    const say = (index: number, follow: boolean) => {
      const current = session;
      if (!current) return;
      const line = current.lines[index];
      if (!line) return stop();
      const previous = current.lines[current.index];
      // The page follows the voice while the line just read is in sight, unless the reader
      // is scrolling right now.
      if (follow || (performance.now() - moved > 1500 && inSight(previous.range)))
        bringIntoSight(line.range);
      current.index = index;
      const turn = ++current.turn;
      highlights()?.set('speech', new Highlight(line.range));
      setSection(line.section);
      const utterance = new SpeechSynthesisUtterance(line.text);
      utterance.lang = line.lang;
      const voice = voiceOf(current, line.lang);
      if (voice) utterance.voice = voice;
      utterance.rate = speed.current;
      const live = () => session === current && current.turn === turn;
      utterance.onend = () => {
        if (live()) say(index + 1, false);
      };
      utterance.onerror = (event) => {
        if (!live()) return;
        current.turn++;
        // Another page or the system may take the voice; anything else is a failure.
        if (event.error !== 'interrupted' && event.error !== 'canceled') setFailed(true);
        listening.update({ status: 'paused' });
      };
      current.utterance = utterance;
      const speak = () => {
        if (live()) synth.speak(utterance);
      };
      if (synth.speaking || synth.pending) {
        synth.cancel();
        // Some browsers drop a line spoken right after cancelling another.
        window.setTimeout(speak, 60);
      } else speak();
    };
    const pause = () => {
      if (!session) return;
      session.turn++;
      synth.cancel();
      listening.update({ status: 'paused' });
    };
    const resume = () => {
      if (!session) return;
      // Scrolled elsewhere while paused, the reader hears what is now on screen.
      const seen = inSight(session.lines[session.index].range) ? -1 : firstInSight(session.lines);
      if (seen >= 0) session.index = seen;
      setFailed(false);
      listening.update({ status: 'playing' });
      say(session.index, true);
    };
    const start = () => {
      const title = root.closest('.reading-page')?.querySelector('.reading-header .article-title');
      const lines = [
        ...(title ? linesOf(title, article.lang) : []),
        ...linesOf(root, article.lang),
      ];
      if (!lines.length) return;
      // From the first line on screen: the title, when the page is at its top.
      session = { lines, index: Math.max(firstInSight(lines), 0), turn: 0, voices: new Map() };
      setFailed(false);
      listening.update({ status: 'playing' });
      say(session.index, true);
    };
    const stop = () => {
      const current = session;
      session = undefined;
      if (current) {
        current.turn++;
        synth.cancel();
      }
      highlights()?.delete('speech');
      setFailed(false);
      listening.update({ status: 'off' });
    };
    const toggle = () => {
      const { status } = listening.get();
      if (status === 'playing') pause();
      else if (status === 'paused') resume();
      else start();
    };
    const retell = () => {
      if (session && listening.get().status === 'playing') say(session.index, false);
    };
    const onMove = () => {
      moved = performance.now();
    };
    const onKey = (event: KeyboardEvent) => {
      if (scrollKeys.has(event.key)) onMove();
    };
    // A page kept for the back button comes back paused, not silent while it says playing.
    const onHide = () => {
      if (listening.get().status === 'playing') pause();
    };

    offer();
    synth.addEventListener('voiceschanged', offer);
    listening.connect({ toggle, stop, retell });
    window.addEventListener('wheel', onMove, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onHide);
    return () => {
      stop();
      listening.connect(undefined);
      synth.removeEventListener('voiceschanged', offer);
      window.removeEventListener('wheel', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onHide);
    };
  }, [bodyRef, article]);

  // The background music rests while the page reads aloud, paused or not.
  const reading = status !== 'off';
  useEffect(() => (reading ? holdMusic() : undefined), [reading]);

  if (status === 'off') return null;
  const changeRate = () => {
    const next = rates[(rates.indexOf(speed.current) + 1) % rates.length];
    speed.current = next;
    setRate(next);
    saveRate(next);
    listening.retell();
  };
  const label = failed ? 'Couldn’t read aloud' : (section ?? article.title);
  return (
    <div className="listen-player" role="group" aria-label="Read aloud">
      <button type="button" className="listen-toggle" onClick={listening.toggle}>
        <Icon name={status === 'playing' ? 'pause' : 'play'} />
        <span className="visually-hidden">{status === 'playing' ? 'Pause:' : 'Resume:'} </span>
        <span className="listen-section" lang={failed ? 'en' : textLanguage(label)}>
          {label}
        </span>
      </button>
      <button type="button" className="listen-rate" onClick={changeRate}>
        <span className="visually-hidden">Speed </span>
        {rate}×
      </button>
      <button
        type="button"
        className="icon-button listen-close"
        aria-label="Stop reading aloud"
        onClick={listening.stop}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
