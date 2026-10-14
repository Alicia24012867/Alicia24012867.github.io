import test from 'node:test';
import assert from 'node:assert/strict';
import { isImageFile, swipeStep, wrapIndex } from '../src/content/reader/photos.ts';

test('links to image files open in the photo viewer; other links keep working', () => {
  for (const url of [
    '/images/summer-sky.webp',
    'https://nymphilia.com/images/moments/cat.JPG',
    '/images/photo.jpeg?v=2#top',
    'diagram.svg',
    '/a.png',
    '/a.gif',
    '/a.avif',
  ])
    assert.equal(isImageFile(url), true, url);
  for (const url of [
    '/blog/moments/',
    'https://github.com/aliciasky',
    '/files/notes.pdf',
    '/images/webp',
    '/images/photo.png/',
    'mailto:me@example.com',
    '',
  ])
    assert.equal(isImageFile(url), false, url);
});

test('a clear sideways swipe steps through the photos', () => {
  // Swiping left shows the next photo, right the previous one.
  assert.equal(swipeStep(-120, 10), 1);
  assert.equal(swipeStep(120, -10), -1);
  assert.equal(swipeStep(-48, 0), 1);
  // Short moves, taps and mostly vertical drags step nowhere.
  assert.equal(swipeStep(-47, 0), 0);
  assert.equal(swipeStep(0, 0), 0);
  assert.equal(swipeStep(90, 70), 0);
  assert.equal(swipeStep(-10, 200), 0);
});

test('stepping past either end wraps around', () => {
  assert.equal(wrapIndex(0, 3), 0);
  assert.equal(wrapIndex(3, 3), 0);
  assert.equal(wrapIndex(-1, 3), 2);
  assert.equal(wrapIndex(4, 3), 1);
  assert.equal(wrapIndex(-4, 3), 2);
  assert.equal(wrapIndex(0, 1), 0);
  assert.equal(wrapIndex(1, 1), 0);
});
