import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestBox, popoverPlacement } from '../src/content/reader/popover.ts';
import { linkedDocument } from '../src/content/reader/links.ts';

const desktop = { width: 1280, height: 800 };
const preview = { width: 340, height: 120 };
const reference = (left, top) => ({ left, top, bottom: top + 14, width: 8 });

test('a popover opens centred just below its link', () => {
  const place = popoverPlacement(reference(500, 300), preview, desktop, { header: 82 });
  assert.equal(place.above, false);
  assert.equal(place.top, 314 + 10);
  assert.equal(place.left, 504 - 170);
  assert.equal(place.caret, 170);
});

test('near the bottom of the screen it opens above, but not into the header', () => {
  const low = popoverPlacement(reference(500, 720), preview, desktop, { header: 82 });
  assert.equal(low.above, true);
  assert.equal(low.top, 720 - 10 - 120);
  // Right under the header there is no room above, so it stays below.
  const high = popoverPlacement(reference(500, 120), { width: 340, height: 600 }, desktop, {
    header: 82,
  });
  assert.equal(high.above, false);
});

test('on a phone it stays inside the 16px gutters and the caret still points at the reference', () => {
  const phone = { width: 390, height: 844 };
  const narrow = { width: 358, height: 140 };
  const right = popoverPlacement(reference(370, 300), narrow, phone);
  assert.equal(right.left, 16);
  assert.equal(right.left + narrow.width, 390 - 16);
  // The reference sits past the preview's right corner, so the caret stops before it.
  assert.equal(right.caret, narrow.width - 14);
  const middle = popoverPlacement(reference(200, 300), narrow, phone);
  assert.equal(middle.caret, 204 - middle.left);
  const left = popoverPlacement(reference(2, 300), narrow, phone);
  assert.equal(left.left, 16);
  // The reference is left of the preview: the caret stops at the corner.
  assert.equal(left.caret, 14);
});

test('link previews pick out other documents of the same collection', () => {
  const page = 'https://nymphilia.com/blog/before_20th_birthday/';
  for (const [href, expected] of [
    ['/blog/moments/', 'moments'],
    ['/blog/moments/#december-11-2025', 'moments'],
    ['./?post=moments', undefined],
    ['/blog/?post=moments', 'moments'],
    ['/blog/2026/note/', '2026/note'],
    // The page itself, its sections, listings, other collections and other sites.
    ['#fn-1', undefined],
    ['/blog/before_20th_birthday/#intro', undefined],
    ['/blog/', undefined],
    ['/notes/source/ta_timestep_control/', undefined],
    ['https://example.com/blog/moments/', undefined],
    ['mailto:alicia@example.com', undefined],
  ])
    assert.equal(linkedDocument(href, page, 'blog'), expected, href);
  assert.equal(
    linkedDocument(
      '/notes/source/ta_timestep_control/',
      'https://nymphilia.com/notes/other/',
      'notes',
    ),
    'source/ta_timestep_control',
  );
});

test('a wrapped link points the card at the line under the pointer', () => {
  const lines = [
    { left: 785, right: 802, top: 470, bottom: 495 },
    { left: 115, right: 160, top: 502, bottom: 527 },
  ];
  assert.equal(nearestBox(lines, { x: 793, y: 482 }), lines[0]);
  assert.equal(nearestBox(lines, { x: 130, y: 515 }), lines[1]);
  // Keyboard focus has no pointer: the first line.
  assert.equal(nearestBox(lines), lines[0]);
});
