import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commentIdentity, commentTheme } from '../src/content/reader/comments.ts';
import { slugFromLocation } from '../src/content/urls.ts';

test('canonical, legacy and index addresses share one discussion without filters', () => {
  for (const collection of ['blog', 'notes']) {
    const slug = 'nested/中文 100%';
    const canonical = commentIdentity(collection, slug);
    for (const address of [
      `https://nymphilia.com/${collection}/?post=${encodeURIComponent(slug)}&q=GPU&sort=oldest`,
      'https://nymphilia.com' + canonical.term + '?q=GPU#heading',
      'http://localhost:5173' + canonical.term + 'index.html',
    ]) {
      assert.deepEqual(
        commentIdentity(collection, slugFromLocation(collection, new URL(address))),
        canonical,
      );
    }
    assert.equal(canonical.backlink, 'https://nymphilia.com' + canonical.term + '#comments');
  }
  assert.notEqual(commentIdentity('blog', 'same').term, commentIdentity('notes', 'same').term);
});

test('comment themes use the production assets and follow the explicit site theme', () => {
  assert.equal(commentTheme('night'), 'https://nymphilia.com/giscus/night.css');
  assert.equal(commentTheme('day'), 'https://nymphilia.com/giscus/day.css');
  assert.equal(commentTheme(undefined), commentTheme('day'));
  for (const theme of ['day', 'night', 'shared']) {
    assert.ok(
      readFileSync(new URL(`../public/giscus/${theme}.css`, import.meta.url), 'utf8').length,
    );
  }
});

test('giscus origin rules allow production and local previews without matching lookalike domains', () => {
  const config = JSON.parse(readFileSync(new URL('../giscus.json', import.meta.url), 'utf8'));
  const allowed = (origin) =>
    config.origins.includes(origin) ||
    config.originsRegex.some((pattern) => new RegExp(pattern).test(origin));
  for (const origin of ['https://nymphilia.com', 'http://localhost:5173', 'http://127.0.0.1:4173'])
    assert.ok(allowed(origin));
  for (const origin of [
    'https://nymphilia.com.evil.test',
    'https://example.com',
    'http://localhost:5173.evil.test',
  ])
    assert.equal(allowed(origin), false);
});
