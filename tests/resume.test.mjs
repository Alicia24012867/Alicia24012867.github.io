import test from 'node:test';
import assert from 'node:assert/strict';
import { readingProgress } from '../src/content/reader/progress.ts';
import {
  bookmarksKey,
  placeAt,
  readBookmarks,
  scrollToPlace,
  sectionAt,
  writeBookmark,
} from '../src/content/reader/resume.ts';

const memory = () => {
  const items = new Map();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
};
const place = (at, extra = {}) => ({
  block: 3,
  offset: 0.25,
  blocks: 40,
  progress: 0.4,
  at,
  ...extra,
});

test('saved places survive a round trip and unreadable ones count as none', () => {
  const store = memory();
  assert.deepEqual(readBookmarks(store), {});
  assert.deepEqual(readBookmarks(undefined), {});
  writeBookmark(store, '/blog/moments/', place(1, { heading: 'section-phase-1' }));
  assert.deepEqual(readBookmarks(store), {
    '/blog/moments/': place(1, { heading: 'section-phase-1' }),
  });
  for (const broken of ['{', '[]', '"text"', '42', 'null']) {
    store.setItem(bookmarksKey, broken);
    assert.deepEqual(readBookmarks(store), {}, broken);
  }
  store.setItem(
    bookmarksKey,
    JSON.stringify({
      '/a/': place(1),
      '/offset/': place(1, { offset: 1.5 }),
      '/past-end/': place(1, { block: 40 }),
      '/fraction/': place(1, { block: 1.5 }),
      '/no-time/': place(undefined),
      '/heading/': place(1, { heading: 3 }),
      '/text/': 'somewhere',
    }),
  );
  assert.deepEqual(Object.keys(readBookmarks(store)), ['/a/']);
});

test('forgetting a place removes it, and the key once nothing is left', () => {
  const store = memory();
  writeBookmark(store, '/a/', place(1));
  writeBookmark(store, '/b/', place(2));
  writeBookmark(store, '/a/', undefined);
  assert.deepEqual(Object.keys(readBookmarks(store)), ['/b/']);
  writeBookmark(store, '/b/', undefined);
  assert.equal(store.items.has(bookmarksKey), false);
  // Forgetting a page that has no place writes nothing.
  let writes = 0;
  writeBookmark(
    { ...store, setItem: () => writes++, removeItem: () => writes++ },
    '/c/',
    undefined,
  );
  assert.equal(writes, 0);
});

test('only the most recently read pages keep their place', () => {
  const store = memory();
  for (let index = 0; index < 25; index++) writeBookmark(store, `/p${index}/`, place(index), 20);
  const kept = Object.keys(readBookmarks(store));
  assert.equal(kept.length, 20);
  assert.ok(!kept.includes('/p4/') && kept.includes('/p5/') && kept.includes('/p24/'));
  // Reading an older page again makes it recent.
  writeBookmark(store, '/p5/', place(100), 20);
  writeBookmark(store, '/p25/', place(101), 20);
  assert.ok(Object.keys(readBookmarks(store)).includes('/p5/'));
  assert.ok(!Object.keys(readBookmarks(store)).includes('/p6/'));
});

test('blocked or full storage never interrupts reading', () => {
  const blocked = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
  assert.deepEqual(readBookmarks(blocked), {});
  assert.doesNotThrow(() => writeBookmark(blocked, '/a/', place(1)));
  const full = memory();
  full.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.doesNotThrow(() => writeBookmark(full, '/a/', place(1)));
});

// Paragraphs 100px tall with 20px between them, starting 300px down the page.
const layout = (count, scrolled = 0) =>
  Array.from({ length: count }, (_, index) => ({ top: 300 + index * 120 - scrolled, height: 100 }));

test('the place is the block under the header and how far into it', () => {
  assert.deepEqual(placeAt(layout(10), 325), { block: 0, offset: 0.25 });
  assert.deepEqual(placeAt(layout(10, 600), 82), { block: 3, offset: 0.22 });
  // Between blocks the next one starts the place; past the last one it ends there.
  assert.deepEqual(placeAt(layout(10), 410), { block: 1, offset: 0 });
  assert.deepEqual(placeAt(layout(10), 5000), { block: 9, offset: 1 });
  assert.deepEqual(placeAt([{ top: 90, height: 0 }], 82), { block: 0, offset: 0 });
  assert.equal(placeAt([], 82), undefined);
});

test('the saved spot returns under the header at any later scroll position', () => {
  const header = 82;
  for (const scrolled of [250, 618, 1203, 2955]) {
    const saved = { ...placeAt(layout(30, scrolled), header), blocks: 30, progress: 0.3, at: 1 };
    // Back at the top of the same article, scrolling by the result restores the spot.
    for (const now of [0, 77, 2000]) {
      const article = { top: 300 - now, height: 30 * 120 };
      const distance = scrollToPlace(saved, layout(30, now), article, header, 800);
      assert.ok(Math.abs(now + distance - scrolled) < 1e-9, `${scrolled} from ${now}`);
    }
  }
});

test('an edited article returns to the same share of it instead', () => {
  const header = 82;
  const screen = 800;
  const saved = { block: 12, offset: 0.5, blocks: 30, progress: 0.4, at: 1 };
  const article = { top: 400, height: 3000 };
  const distance = scrollToPlace(saved, layout(31), article, header, screen);
  const after = readingProgress(article.top - distance, article.height, header, screen);
  assert.ok(Math.abs(after - 0.4) < 1e-9, String(after));
  // An article that now fits on one screen needs no scrolling.
  assert.equal(scrollToPlace(saved, layout(3), { top: 200, height: 500 }, header, screen), 0);
});

test('the section is the last heading the reader has passed', () => {
  const headings = [
    { id: 'introduction', top: 120 },
    { id: 'main', top: 900 },
    { id: 'end', top: 1600 },
  ];
  assert.equal(sectionAt(headings, 113), undefined);
  assert.equal(sectionAt(headings, 120), 'introduction');
  assert.equal(sectionAt(headings, 1000), 'main');
  assert.equal(sectionAt(headings, 5000), 'end');
  assert.equal(sectionAt([], 113), undefined);
});
