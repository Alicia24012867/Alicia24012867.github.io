import test from 'node:test';
import assert from 'node:assert/strict';
import { footnotePlacement } from '../src/content/reader/footnotes.ts';

const desktop = { width: 1280, height: 800 };
const preview = { width: 340, height: 120 };
const reference = (left, top) => ({ left, top, bottom: top + 14, width: 8 });

test('a preview opens centred just below its reference', () => {
  const place = footnotePlacement(reference(500, 300), preview, desktop, { header: 82 });
  assert.equal(place.above, false);
  assert.equal(place.top, 314 + 10);
  assert.equal(place.left, 504 - 170);
  assert.equal(place.caret, 170);
});

test('near the bottom of the screen it opens above, but not into the header', () => {
  const low = footnotePlacement(reference(500, 720), preview, desktop, { header: 82 });
  assert.equal(low.above, true);
  assert.equal(low.top, 720 - 10 - 120);
  // Right under the header there is no room above, so it stays below.
  const high = footnotePlacement(reference(500, 120), { width: 340, height: 600 }, desktop, {
    header: 82,
  });
  assert.equal(high.above, false);
});

test('on a phone it stays inside the 16px gutters and the caret still points at the reference', () => {
  const phone = { width: 390, height: 844 };
  const narrow = { width: 358, height: 140 };
  const right = footnotePlacement(reference(370, 300), narrow, phone);
  assert.equal(right.left, 16);
  assert.equal(right.left + narrow.width, 390 - 16);
  // The reference sits past the preview's right corner, so the caret stops before it.
  assert.equal(right.caret, narrow.width - 14);
  const middle = footnotePlacement(reference(200, 300), narrow, phone);
  assert.equal(middle.caret, 204 - middle.left);
  const left = footnotePlacement(reference(2, 300), narrow, phone);
  assert.equal(left.left, 16);
  // The reference is left of the preview: the caret stops at the corner.
  assert.equal(left.caret, 14);
});
