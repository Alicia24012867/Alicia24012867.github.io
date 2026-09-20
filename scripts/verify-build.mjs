import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.vite/manifest.json'), 'utf8'));
const deferred = /virtual:|ArticleReader|NoteReader|ArticleBody|renderMermaid|katex/i;
for (const page of ['index.html', 'blog/index.html', 'notes/index.html']) {
  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    assert.ok(!deferred.test(key), `${page} eagerly imports ${key}`);
    const chunk = manifest[key];
    for (const css of chunk.css ?? [])
      assert.ok(!/(katex|reader)/i.test(css), `${page} eagerly loads reader or formula styles`);
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  visit(page);
}
for (const [key, chunk] of Object.entries(manifest)) {
  if (!/virtual:.*\/entry\//.test(key)) continue;
  assert.ok(chunk.isDynamicEntry, `${key} is not lazy`);
  for (const dependency of chunk.imports ?? [])
    assert.ok(!/virtual:.*\/entry\//.test(dependency), `${key} loads another document`);
}
console.log(
  'Build verified: listings exclude article bodies, readers, diagrams, and formula styles.',
);
