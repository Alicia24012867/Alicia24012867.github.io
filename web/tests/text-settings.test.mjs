import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  lineSpacings,
  markTextSettings,
  readTextSettings,
  steppedTextSize,
  textFonts,
  textSettingsKey,
  textSizes,
  usualText,
  writtenTextSettings,
} from '../src/content/reader/textSettings.ts';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

// An element that only keeps its attributes.
function element() {
  const attributes = new Map();
  return {
    attributes,
    dataset: {},
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
  };
}

const every = textSizes.flatMap((size) =>
  lineSpacings.flatMap((spacing) => textFonts.map((font) => ({ size, spacing, font }))),
);

test('kept settings are read back, each unknown one as usual', () => {
  assert.deepEqual(readTextSettings(null), usualText);
  assert.deepEqual(readTextSettings('{"size":"112"}'), { ...usualText, size: '112' });
  assert.deepEqual(readTextSettings('{"spacing":"relaxed","font":"serif"}'), {
    size: '100',
    spacing: 'relaxed',
    font: 'serif',
  });
  // Values from elsewhere, or broken ones, leave the text as usual.
  assert.deepEqual(readTextSettings('{"size":"300","spacing":"wide","font":"comic"}'), usualText);
  assert.deepEqual(readTextSettings('{"size":112}'), usualText);
  assert.deepEqual(readTextSettings('{"size":'), usualText);
  assert.deepEqual(readTextSettings('[1,2]'), usualText);
  assert.deepEqual(readTextSettings('"serif"'), usualText);
});

test('only the changed settings are kept, and usual ones keep nothing', () => {
  assert.equal(writtenTextSettings(usualText), null);
  assert.equal(writtenTextSettings({ ...usualText, font: 'serif' }), '{"font":"serif"}');
  for (const settings of every)
    assert.deepEqual(readTextSettings(writtenTextSettings(settings)), settings);
});

test('the size steps up and down, and stops at either end', () => {
  assert.equal(steppedTextSize('100', 1), '112');
  assert.equal(steppedTextSize('100', -1), '90');
  assert.equal(steppedTextSize('140', 1), undefined);
  assert.equal(steppedTextSize('90', -1), undefined);
  assert.equal(textSizes.indexOf(usualText.size), 1);
});

test('the page is marked with the changed settings only', () => {
  const root = element();
  markTextSettings(root, { size: '125', spacing: 'normal', font: 'serif' });
  assert.deepEqual(Object.fromEntries(root.attributes), {
    'data-reading-size': '125',
    'data-reading-font': 'serif',
  });
  markTextSettings(root, usualText);
  assert.equal(root.attributes.size, 0);
});

test('each page marks the kept settings before it is drawn, as the reader would', () => {
  for (const page of ['blog/index.html', 'notes/index.html']) {
    const html = read(page);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    assert.equal(scripts.length, 1, page);
    const kept = [
      ...every.map(writtenTextSettings),
      '{"size":"300","font":"serif"}',
      '{"size":',
      'null',
      '7',
    ];
    for (const saved of kept) {
      const root = element();
      const storage = { [textSettingsKey]: saved };
      vm.runInNewContext(scripts[0], {
        document: { documentElement: root },
        localStorage: { getItem: (key) => storage[key] ?? null },
        JSON,
      });
      const expected = element();
      markTextSettings(expected, readTextSettings(saved));
      // Unknown values may be marked too; the styles only know the real ones.
      const known = [...root.attributes].filter(([name, value]) => {
        const key = name.replace('data-reading-', '');
        return (
          usualText[key] !== value &&
          readTextSettings(JSON.stringify({ [key]: value }))[key] === value
        );
      });
      assert.deepEqual(
        Object.fromEntries(known),
        Object.fromEntries(expected.attributes),
        `${page}: ${saved}`,
      );
    }
    // Without storage the page still opens, in the usual text and its theme.
    const root = element();
    vm.runInNewContext(scripts[0], {
      document: { documentElement: root },
      get localStorage() {
        throw new Error('blocked');
      },
      JSON,
    });
    assert.equal(root.attributes.size, 0);
    assert.equal(root.dataset.theme, 'day');
  }
});

test('the styles know every setting except the usual ones', () => {
  const css = read('src/content/reader/reader.css');
  const choices = { size: textSizes, spacing: lineSpacings, font: textFonts };
  for (const [key, values] of Object.entries(choices))
    for (const value of values)
      assert.equal(
        css.includes(`:root[data-reading-${key}='${value}']`),
        value !== usualText[key],
        `${key} ${value}`,
      );
});
