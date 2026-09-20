import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const report = process.argv.includes('--report');
const root = path.resolve(process.argv.slice(2).find((arg) => arg !== '--report') || 'dist');
const sizes = {};
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.vite/manifest.json'), 'utf8'));
const deferred = /virtual:|ArticleReader|NoteReader|ArticleBody|renderMermaid|katex/i;
for (const page of ['index.html', 'blog/index.html', 'notes/index.html']) {
  const visited = new Set();
  const files = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    assert.ok(!deferred.test(key), `${page} eagerly imports ${key}`);
    const chunk = manifest[key];
    assert.ok(chunk, `Missing build chunk: ${key}`);
    files.add(chunk.file);
    for (const css of chunk.css ?? []) {
      files.add(css);
      assert.ok(!/(katex|reader)/i.test(css), `${page} eagerly loads reader or formula styles`);
    }
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  visit(page);
  if (report) {
    const total = { js: 0, jsGzip: 0, css: 0, cssGzip: 0 };
    for (const file of files) {
      const data = fs.readFileSync(path.join(root, file));
      const type = file.endsWith('.css') ? 'css' : 'js';
      total[type] += data.length;
      total[`${type}Gzip`] += gzipSync(data).length;
    }
    sizes[page] = total;
  }
}
for (const [key, chunk] of Object.entries(manifest)) {
  if (!/virtual:.*\/entry\//.test(key)) continue;
  assert.ok(chunk.isDynamicEntry, `${key} is not lazy`);
  for (const dependency of chunk.imports ?? [])
    assert.ok(!/virtual:.*\/entry\//.test(dependency), `${key} loads another document`);
}
if (report) console.log(JSON.stringify(sizes, null, 2));
else
  console.log(
    'Build verified: listings exclude article bodies, readers, diagrams, and formula styles.',
  );
