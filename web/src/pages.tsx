import { StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Each page of the site (home, blog, notes, the missing page) is its own document, and opens as
 * one from an address. A link from one page to another swaps the page in place instead, so that
 * the background music plays on: the new page's address, head and styles come in, and its entry
 * draws it. The back and forward buttons step through the swapped pages, back to their places.
 */

/** Sent just before the page is swapped, as `pagehide` would be on leaving it. */
export const pageLeave = 'alicia-page-leave';

const pages = new Map<string, () => ReactNode>();
let root: Root | undefined;
// While a page's entry loads for a swap, it only says how to draw it.
let swapping = false;

function draw(page: () => ReactNode) {
  root = createRoot(document.getElementById('root')!);
  root.render(<StrictMode>{page()}</StrictMode>);
}

/** Draws this page: each entry calls it with its own address, `import.meta.url`. */
export function showPage(entry: string, page: () => ReactNode) {
  pages.set(entry, page);
  if (swapping) return;
  if (!root) listen();
  draw(page);
}

const scrollKey = 'alicia-scroll';
const keptHead =
  'title, meta[name]:not([name="viewport"], [name="theme-color"], [name="color-scheme"]), meta[property], link[rel="canonical"], link[rel="alternate"]';

/** The page an address opens, if it is a page of this site that the swap can show. */
function pageAt(address: string) {
  const url = new URL(address, location.href);
  if (url.origin !== location.origin) return;
  if (!/^\/(?:[^/]+\/)*$/.test(url.pathname) && url.pathname !== '/404.html') return;
  // Another place in this page is the browser's to scroll to.
  if (url.pathname === location.pathname && url.search === location.search) return;
  return url;
}
const pageOf = (link: HTMLAnchorElement) =>
  link.target || link.hasAttribute('download') ? undefined : pageAt(link.href);

type Fetched = { url: string; html: string };
const fetched = new Map<string, Promise<Fetched>>();

/** The page's HTML, fetched once for a hover and the press that follows it. */
function fetchPage(address: string) {
  let page = fetched.get(address);
  if (!page) {
    page = fetch(address, { headers: { accept: 'text/html' } }).then(async (response) => {
      const type = response.headers.get('content-type') ?? '';
      if ((!response.ok && response.status !== 404) || !type.includes('text/html'))
        throw new Error(`Not a page: ${address}`);
      return { url: response.url || address, html: await response.text() };
    });
    fetched.set(address, page);
    const forget = () => window.setTimeout(() => fetched.delete(address), 15000);
    page.then(forget, () => fetched.delete(address));
  }
  return page;
}

const entriesOf = (next: Document, base: string) =>
  [...next.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map(
    (script) => new URL(script.getAttribute('src')!, base).href,
  );

const prepared = new Set<string>();
/** Fetches a page about to be opened, with the code and styles it will need. */
function prepare(address: string) {
  if (prepared.has(address)) return;
  prepared.add(address);
  fetchPage(address).then(
    (page) => {
      const next = new DOMParser().parseFromString(page.html, 'text/html');
      const links = [
        ...entriesOf(next, page.url).map((href) => ({ rel: 'modulepreload', href })),
        ...[...next.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map((l) => ({
          rel: 'modulepreload',
          href: new URL(l.getAttribute('href')!, page.url).href,
        })),
        ...[...next.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => ({
          rel: 'preload',
          href: new URL(l.getAttribute('href')!, page.url).href,
        })),
      ];
      const known = new Set(
        [...document.querySelectorAll<HTMLLinkElement>('link[href]')].map((l) => l.href),
      );
      for (const { rel, href } of links) {
        if (known.has(href)) continue;
        known.add(href);
        const link = document.createElement('link');
        link.rel = rel;
        if (rel === 'preload') link.as = 'style';
        link.crossOrigin = '';
        link.href = href;
        document.head.append(link);
      }
      window.setTimeout(() => prepared.delete(address), 15000);
    },
    () => prepared.delete(address),
  );
}

/** The new page's styles, added beside the ones here; it is drawn once they have loaded. */
function addStyles(next: Document, base: string) {
  const here = new Set(
    [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href),
  );
  const loading: Promise<unknown>[] = [];
  for (const link of next.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    const href = new URL(link.getAttribute('href')!, base).href;
    if (here.has(href)) continue;
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    if (link.crossOrigin !== null) style.crossOrigin = link.crossOrigin;
    style.href = href;
    loading.push(
      new Promise((done) => {
        style.onload = style.onerror = done;
      }),
    );
    document.head.append(style);
  }
  return Promise.all(loading);
}

function swapHead(next: Document) {
  for (const element of document.head.querySelectorAll(keptHead)) element.remove();
  document.head.append(...[...next.head.querySelectorAll(keptHead)].map((e) => e.cloneNode(true)));
  for (const link of next.head.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]'))
    if (
      !document.head.querySelector(`link[rel="modulepreload"][href="${link.getAttribute('href')}"]`)
    )
      document.head.append(link.cloneNode(true));
  // The page's own settings from the reader's storage, such as the text of documents.
  for (const script of next.head.querySelectorAll('script:not([src]):not([type])')) {
    const run = document.createElement('script');
    run.textContent = script.textContent;
    document.head.append(run);
    run.remove();
  }
  if (next.documentElement.lang) document.documentElement.lang = next.documentElement.lang;
}

/** Scrolls to the kept place, or to the anchor, once the page has grown enough to have it. */
function settle(top: number, hash: string) {
  const began = performance.now();
  let stopped = false;
  const stops = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  const stop = () => {
    stopped = true;
    for (const type of stops) window.removeEventListener(type, stop);
  };
  for (const type of stops) window.addEventListener(type, stop, { passive: true });
  const id = hash && decodeURIComponent(hash.slice(1));
  const step = () => {
    if (stopped) return;
    const target = id ? document.getElementById(id) : null;
    if (target) target.scrollIntoView({ behavior: 'instant' });
    else if (!id) window.scrollTo({ top, behavior: 'instant' });
    const there = target ? true : !id && Math.abs(window.scrollY - top) < 2;
    if (there || performance.now() - began > 2000) stop();
    else requestAnimationFrame(step);
  };
  step();
}

let turn = 0;
/** Shows the page at `url` in place of this one; anything amiss opens it as usual instead. */
async function swap(url: URL, push: boolean, top = 0) {
  const mine = ++turn;
  try {
    const page = await fetchPage(url.href.replace(/#.*/, ''));
    if (mine !== turn) return;
    const next = new DOMParser().parseFromString(page.html, 'text/html');
    const entries = entriesOf(next, page.url);
    await addStyles(next, page.url);
    swapping = true;
    try {
      for (const entry of entries) if (!pages.has(entry)) await import(/* @vite-ignore */ entry);
    } finally {
      swapping = false;
    }
    const entry = entries.find((address) => pages.has(address));
    if (!entry) throw new Error(`No page drawn by ${url.href}`);
    if (mine !== turn) return;

    window.dispatchEvent(new Event(pageLeave));
    if (push) {
      history.replaceState({ ...history.state, [scrollKey]: window.scrollY }, '');
      const address = new URL(page.url);
      address.hash = url.hash;
      history.pushState({ [scrollKey]: 0 }, '', address);
    }
    root?.unmount();
    root = undefined;
    swapHead(next);
    document.body.replaceChildren(
      ...[...next.body.childNodes]
        .filter((node) => !(node instanceof Element && node.matches('script, noscript')))
        .map((node) => document.importNode(node, true)),
    );
    draw(pages.get(entry)!);
    settle(top, url.hash);
    // Kept for reading offline, as a page opened as usual is (src/offline.ts).
    navigator.serviceWorker?.controller?.postMessage({
      type: 'keep',
      page: location.href,
      files: performance.getEntriesByType('resource').map((resource) => resource.name),
    });
  } catch {
    if (mine === turn) location.assign(url.href);
  }
}

/** Opens a page of the site from a script, as a link to it would. */
export function openPage(address: string) {
  const url = pageAt(address);
  if (!url || !root) return location.assign(address);
  go(url);
}

// The page here, so that a step back to another place in it, or to other filters of a list, is
// left to the browser and the page.
let shown = location.pathname;

function go(url: URL) {
  // The browser no longer puts back the place in a swapped page: the swap does.
  history.scrollRestoration = 'manual';
  shown = url.pathname;
  swap(url, true);
}

/** Links swap the page, and the history steps through the swapped pages. */
function listen() {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    const url = link instanceof HTMLAnchorElement ? pageOf(link) : undefined;
    if (!url) return;
    event.preventDefault();
    go(url);
  });
  // A page about to be opened is fetched as the pointer comes to its link.
  document.addEventListener('pointerover', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a[href]');
    const url = link instanceof HTMLAnchorElement ? pageOf(link) : undefined;
    if (url) prepare(url.href.replace(/#.*/, ''));
  });
  // The place in a swapped page is kept with its step in the history, for coming back to it.
  let keeping = 0;
  window.addEventListener(
    'scroll',
    () => {
      if (history.scrollRestoration !== 'manual') return;
      window.clearTimeout(keeping);
      keeping = window.setTimeout(() => {
        history.replaceState({ ...history.state, [scrollKey]: window.scrollY }, '');
      }, 250);
    },
    { passive: true },
  );
  window.addEventListener('popstate', (event) => {
    const here = location.pathname;
    if (here === shown) return;
    shown = here;
    const top = (event.state as Record<string, unknown> | null)?.[scrollKey];
    swap(new URL(location.href), false, typeof top === 'number' ? top : 0);
  });
}
