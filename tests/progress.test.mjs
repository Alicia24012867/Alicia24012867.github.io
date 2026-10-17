import test from 'node:test';
import assert from 'node:assert/strict';
import { minutesLeft, readingProgress } from '../src/content/reader/progress.ts';

// A 3000px article below an 82px header on an 800px screen: 718px are visible at a time.
const header = 82;
const screen = 800;
const at = (scrolled) => readingProgress(400 - scrolled, 3000, header, screen);

test('the line stays empty until the article passes under the header', () => {
  assert.equal(at(0), 0);
  assert.equal(at(318), 0);
  assert.ok(at(319) > 0 && at(319) < 0.001);
});

test('the line fills evenly and is full once the last line is on screen', () => {
  const distance = 3000 - (screen - header);
  assert.equal(at(318 + distance / 2), 0.5);
  assert.equal(at(318 + distance), 1);
  // Comments and the page footer below the article keep it full.
  assert.equal(at(318 + distance + 900), 1);
  for (let scrolled = 0, last = 0; scrolled < 4000; scrolled += 37) {
    const progress = at(scrolled);
    assert.ok(progress >= last && progress <= 1);
    last = progress;
  }
});

test('an article shorter than the screen is read once all of it is in view', () => {
  assert.equal(readingProgress(300, 400, header, screen), 1);
  assert.equal(readingProgress(500, 400, header, screen), 0);
  assert.equal(readingProgress(-100, 400, header, screen), 1);
  // Exactly as tall as the visible page.
  assert.equal(readingProgress(header, screen - header, header, screen), 1);
});

test('the minutes left count down while reading, and only then', () => {
  assert.equal(minutesLeft(9, 0), undefined);
  assert.equal(minutesLeft(9, 0.049), undefined);
  assert.equal(minutesLeft(9, 0.05), 9);
  assert.equal(minutesLeft(9, 0.5), 5);
  assert.equal(minutesLeft(9, 0.9), 1);
  // Nearly done, the place is no longer kept and nothing is left to count.
  assert.equal(minutesLeft(9, 0.95), undefined);
  assert.equal(minutesLeft(9, 1), undefined);
  // A short read needs no countdown.
  assert.equal(minutesLeft(2, 0.5), undefined);
  assert.equal(minutesLeft(3, 0.5), 2);
  for (let progress = 0.05, last = Infinity; progress < 0.95; progress += 0.01) {
    const left = minutesLeft(20, progress);
    assert.ok(left >= 1 && left <= last);
    last = left;
  }
});
