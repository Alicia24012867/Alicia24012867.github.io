import test from 'node:test';
import assert from 'node:assert/strict';
import { likeness, suggestionsFor } from '../src/content/suggest.ts';

const titles = {
  blog: [
    ['moments', 'Moments in life'],
    ['thoughts_on_ai', 'Some thoughts on the use of Artificial Intelligence'],
    ['go_live', 'A gift to myself'],
    ['before_20th_birthday', '写在20岁前'],
  ],
  notes: [['source/ta_timestep_control', 'Transient Analysis - timestep control']],
};
const paths = (pathname) => suggestionsFor(pathname, titles).map((suggestion) => suggestion.path);

test('likeness counts the edits between two names', () => {
  assert.equal(likeness('moments', 'moments'), 1);
  assert.equal(likeness('moment', 'moments'), 1 - 1 / 7);
  assert.equal(likeness('', ''), 1);
  assert.equal(likeness('abc', 'xyz'), 0);
});

test('a mistyped, respelled or moved address finds its document', () => {
  assert.deepEqual(paths('/blog/moment/')[0], '/blog/moments/');
  assert.deepEqual(paths('/blog/Moments')[0], '/blog/moments/');
  assert.deepEqual(paths('/blog/thoughts-on-ai/')[0], '/blog/thoughts_on_ai/');
  assert.deepEqual(
    paths('/blog/before-20th-birthday/index.html')[0],
    '/blog/before_20th_birthday/',
  );
  // Moved into a folder, or linked without the collection.
  assert.deepEqual(paths('/notes/ta_timestep_control/')[0], '/notes/source/ta_timestep_control/');
  assert.deepEqual(paths('/moments/')[0], '/blog/moments/');
  // A dated address, words of the title, and a title written as the address.
  assert.deepEqual(paths('/blog/2026/10/moments/')[0], '/blog/moments/');
  assert.deepEqual(paths('/blog/artificial-intelligence/')[0], '/blog/thoughts_on_ai/');
  assert.deepEqual(
    paths('/blog/%E5%86%99%E5%9C%A820%E5%B2%81%E5%89%8D/')[0],
    '/blog/before_20th_birthday/',
  );
  assert.deepEqual(paths('/notes/timestep/')[0], '/notes/source/ta_timestep_control/');
});

test('an address unlike every document suggests nothing', () => {
  assert.deepEqual(paths('/blog/quantum-chromodynamics/'), []);
  assert.deepEqual(paths('/'), []);
  assert.deepEqual(paths('/blog/'), []);
  assert.deepEqual(paths('/blog/%E4%'), []);
  assert.deepEqual(paths('/blog/a/'), []);
  assert.deepEqual(suggestionsFor('/blog/moment/', {}), []);
});

test('suggestions name their collection and title, best first, at most three', () => {
  const [first] = suggestionsFor('/blog/moment/', titles);
  assert.deepEqual(first, { collection: 'blog', title: 'Moments in life', path: '/blog/moments/' });
  const many = {
    blog: Array.from({ length: 6 }, (_, index) => [`moments-${index}`, `Moments ${index}`]),
  };
  assert.equal(suggestionsFor('/blog/moments/', many).length, 3);
  assert.equal(suggestionsFor('/blog/moments/', many, 5).length, 5);
  // The collection the address names comes first when both fit.
  const both = { blog: [['timestep', 'Timestep']], notes: [['timestep', 'Timestep']] };
  assert.deepEqual(
    suggestionsFor('/notes/timestep/', both).map((suggestion) => suggestion.collection),
    ['notes', 'blog'],
  );
});
