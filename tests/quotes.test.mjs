import test from 'node:test';
import assert from 'node:assert/strict';
import { findQuote, isQuoteHash, parseQuote, quoteHash } from '../src/content/reader/quote.ts';
import { flatten, pointOf, stretchOf } from '../src/content/reader/textMap.ts';

const part = (node, text, gap = false) => ({ node, text, gap });
const at = (flat, node) => [...flat.pieces.find((piece) => piece.node === node).at];

test('the flattened text keeps one space per whitespace run and sets blocks apart', () => {
  const flat = flatten([
    part('a', '  Hello\n  ', true),
    part('b', 'world'),
    part('c', 'Next', true),
    part('d', 'line'),
    part('e', '今天\n天气', true),
  ]);
  assert.equal(flat.text, 'Hello world Nextline 今天 天气');
  // Leading and repeated whitespace has no place in the text.
  assert.deepEqual(at(flat, 'a'), [-1, -1, 0, 1, 2, 3, 4, 5, -1, -1]);
  assert.deepEqual(at(flat, 'b'), [6, 7, 8, 9, 10]);
  // The gap before a new block is a space no node owns.
  assert.deepEqual(at(flat, 'c'), [12, 13, 14, 15]);
  assert.equal(flatten([part('x', 'one', true), part('y', ' two', true)]).text, 'one two');
});

test('a selection maps to the stretch it covers, without spaces at its ends', () => {
  const flat = flatten([part('a', 'Hello\n  ', true), part('b', 'world'), part('c', 'Next', true)]);
  const spans = { a: [4, 8], b: [0, 3] };
  assert.deepEqual(
    stretchOf(flat, (node) => spans[node]),
    { from: 4, to: 9 },
  );
  assert.equal(flat.text.slice(4, 9), 'o wor');
  // Only whitespace of the first node is selected: the passage starts with the next word.
  const words = { a: [5, 8], b: [0, 5] };
  const word = stretchOf(flat, (node) => words[node]);
  assert.equal(flat.text.slice(word.from, word.to), 'world');
  assert.equal(
    stretchOf(flat, (node) => (node === 'a' ? [6, 8] : undefined)),
    undefined,
  );
  assert.deepEqual(pointOf(flat, 6), { node: 'b', offset: 0 });
  assert.deepEqual(pointOf(flat, 13), { node: 'c', offset: 1 });
  // The space between blocks belongs to no node.
  assert.equal(pointOf(flat, 11), undefined);
});

const text =
  'The sky is blue today. The sea is blue too, and the clouds (white) don’t move. ' +
  'A long walk by the water gave me time to think about the year, the people I met, ' +
  'the places I saw and the small moments that stayed with me long after the day had ended. ' +
  'Then the rain came back.';
const passage = (words, from = text.indexOf(words)) => ({ from, to: from + words.length });
const roundTrip = (stretch) => findQuote(text, parseQuote(quoteHash(text, stretch)));

test('a short passage travels whole, counted among its repeats', () => {
  assert.equal(quoteHash(text, passage('sky is blue')), '#quote=sky%20is%20blue');
  const second = passage('is blue', text.indexOf('is blue', text.indexOf('is blue') + 1));
  assert.equal(quoteHash(text, second), '#quote=is%20blue&n=2');
  assert.deepEqual(roundTrip(second), second);
  assert.deepEqual(roundTrip(passage('The')), passage('The'));
});

test('the link keeps brackets, apostrophes and a final full stop inside the address', () => {
  const hash = quoteHash(text, passage('the clouds (white) don’t move.'));
  assert.equal(hash, '#quote=the%20clouds%20%28white%29%20don%E2%80%99t%20move%2E');
  assert.match(quoteHash('It’s Alicia’s.', { from: 0, to: 14 }), /%E2%80%99s%2E$/);
  assert.equal(quoteHash("it's (fine)!", { from: 0, to: 12 }), '#quote=it%27s%20%28fine%29%21');
});

test('a long passage travels by its two ends', () => {
  const long = passage(text.slice(text.indexOf('A long walk'), text.indexOf(' Then')));
  const hash = quoteHash(text, long);
  assert.ok(hash.length < 160, hash);
  const quote = parseQuote(hash);
  assert.equal(quote.start, 'A long walk by the water gave me');
  assert.equal(quote.end, 'me long after the day had ended.');
  assert.deepEqual(roundTrip(long), long);
});

test('Chinese passages keep each end short once encoded', () => {
  const chinese =
    '今天的天空很蓝。'.repeat(2) +
    '我们沿着海边走了很久，聊起这一年遇见的人、去过的地方和那些留在心里的小事。后来下起了雨，' +
    '我们躲进一家小店，喝着热茶看窗外的街道慢慢安静下来，直到天色暗了才回家。';
  const stretch = { from: 16, to: chinese.length };
  const hash = quoteHash(chinese, stretch);
  const quote = parseQuote(hash);
  assert.equal(Array.from(quote.start).length, 10);
  assert.ok(hash.length < 220, hash);
  assert.deepEqual(findQuote(chinese, quote), stretch);
  // The second of two identical sentences is counted as such.
  assert.deepEqual(findQuote(chinese, parseQuote(quoteHash(chinese, { from: 8, to: 16 }))), {
    from: 8,
    to: 16,
  });
});

test('closing words that come up inside the passage send it whole', () => {
  const repeated = 'ha '.repeat(120).trim();
  const stretch = { from: 3, to: repeated.length };
  const hash = quoteHash(repeated, stretch);
  assert.equal(parseQuote(hash).end, undefined);
  assert.deepEqual(findQuote(repeated, parseQuote(hash)), stretch);
});

test('opening a quote link tolerates edits and rejects broken links', () => {
  assert.ok(isQuoteHash('#quote=x'));
  assert.ok(!isQuoteHash('#section'));
  assert.equal(parseQuote('#quote='), undefined);
  assert.equal(parseQuote('#quote=%E4'), undefined);
  assert.equal(parseQuote('#quote=a,b,c'), undefined);
  assert.equal(parseQuote('#quote=a,'), undefined);
  assert.deepEqual(parseQuote('#quote=sky%20%20is%0Ablue&n=zero'), {
    start: 'sky is blue',
    end: undefined,
    n: 1,
  });
  // An occurrence past the last match falls back to the last one.
  assert.deepEqual(
    findQuote(text, { start: 'is blue', n: 5 }),
    passage('is blue', text.lastIndexOf('is blue')),
  );
  assert.equal(findQuote(text, { start: 'snow', n: 1 }), undefined);
  assert.equal(findQuote(text, { start: 'The sky', end: 'snow', n: 1 }), undefined);
});
