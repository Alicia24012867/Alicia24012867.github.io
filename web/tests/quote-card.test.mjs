import test from 'node:test';
import assert from 'node:assert/strict';
import { qrCode } from '../src/content/reader/qr.ts';
import {
  breakUnits,
  cardCode,
  ellipsize,
  fitLine,
  fitText,
  wrapLines,
} from '../src/content/reader/quoteCard.ts';

// Chinese characters and punctuation twice as wide as the rest, as the card's fonts set them.
const width = (text) => [...text].reduce((sum, char) => sum + (/[⺀-￯]/.test(char) ? 2 : 1), 0);

test('a line may break between Chinese characters and after spaces, not inside words', () => {
  assert.deepEqual(breakUnits('你好，世界。'), ['你', '好，', '世', '界。']);
  assert.deepEqual(breakUnits('Hello big world'), ['Hello ', 'big ', 'world']);
  assert.deepEqual(breakUnits('AI很强'), ['AI', '很', '强']);
  assert.deepEqual(breakUnits('0.9 is fine.'), ['0.9 ', 'is ', 'fine.']);
  // Punctuation stays with the words it closes or opens.
  assert.deepEqual(breakUnits('“真的吗？”她问'), ['“真', '的', '吗？”', '她', '问']);
  assert.deepEqual(breakUnits('once again，也只是'), ['once ', 'again，', '也', '只', '是']);
  assert.deepEqual(breakUnits('等等——好的……'), ['等', '等——', '好', '的……']);
  assert.deepEqual(breakUnits('（笑）'), ['（笑）']);
});

test('a passage wraps to lines no wider than the column', () => {
  const lines = wrapLines('你好，世界。今天天气很好。', 10, width);
  assert.deepEqual(lines, ['你好，世', '界。今天天', '气很好。']);
  assert.deepEqual(wrapLines('one two three four five six seven eight nine ten', 20, width), [
    'one two three four',
    'five six seven eight',
    'nine ten',
  ]);
  // An address longer than a line is cut where it must be.
  const cut = wrapLines('see https://nymphilia.com/blog/before_20th_birthday/ now', 16, width);
  assert.deepEqual(cut, ['see', 'https://nymphili', 'a.com/blog/befor', 'e_20th_birthday/', 'now']);
  for (const line of [...lines, ...cut]) assert.ok(width(line) <= 16, line);
  assert.deepEqual(wrapLines('', 10, width), []);
});

test('a line too long for its room ends in an ellipsis, without punctuation before it', () => {
  assert.equal(ellipsize('一二三四五六七八', 10, width), '一二三四…');
  assert.equal(ellipsize('你好，世界', 8, width), '你好…');
  assert.equal(ellipsize('A fine day', 7, width), 'A fine…');
  assert.equal(fitLine('BLOG / LIFE', 20, width), 'BLOG / LIFE');
  assert.equal(fitLine('KNOWLEDGE BASE / SOURCE', 12, width), 'KNOWLEDGE B…');
});

test('a passage takes the largest size it fits at, else the smallest and an ellipsis', () => {
  // Each character is as wide as the size; the column is 100 wide and holds 120 / size lines.
  const at = (size) => (text) => [...text].length * size;
  const room = (size) => Math.floor(120 / size);
  const sizes = [20, 10, 5];
  assert.deepEqual(fitText('几个字', sizes, 100, room, at), { size: 20, lines: ['几个字'] });
  assert.equal(fitText('字'.repeat(20), sizes, 100, room, at).size, 20);
  assert.deepEqual(fitText('字'.repeat(40), sizes, 100, room, at), {
    size: 10,
    lines: Array(4).fill('字'.repeat(10)),
  });
  const long = fitText('字'.repeat(600), sizes, 100, room, at);
  assert.equal(long.size, 5);
  assert.equal(long.lines.length, 24);
  assert.equal(long.lines.at(-1), '字'.repeat(19) + '…');
  assert.ok(long.lines.every((line) => at(5)(line) <= 100));
});

test('the code leads to the passage while it is coarse enough to scan, else to the page', () => {
  const same = (a, b) =>
    a.size === b.size &&
    Array.from({ length: a.size ** 2 }, (_, i) => i).every(
      (i) =>
        a.dark(i % a.size, Math.floor(i / a.size)) === b.dark(i % a.size, Math.floor(i / a.size)),
    );
  const page = 'https://nymphilia.com/blog/before_20th_birthday/';
  const short = page + '#quote=' + encodeURIComponent('嗯嗯，说的很对');
  const long =
    page +
    '#quote=' +
    encodeURIComponent('虽然最近确实常常低落且十分焦虑') +
    ',' +
    encodeURIComponent('确实就是这样。');
  assert.ok(same(cardCode([short, page]), qrCode(short)));
  assert.ok(qrCode(short).size <= 45);
  assert.ok(qrCode(long).size > 45);
  assert.ok(same(cardCode([long, page]), qrCode(page)));
});
