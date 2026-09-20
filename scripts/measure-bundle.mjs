import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const directory = path.resolve(process.argv[2] || 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, '.vite/manifest.json'), 'utf8'));
const result = {};
for (const entry of ['index.html', 'blog/index.html', 'notes/index.html']) {
  const visited = new Set();
  const files = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    files.add(chunk.file);
    for (const css of chunk.css || []) files.add(css);
    for (const dependency of chunk.imports || []) visit(dependency);
  }
  visit(entry);
  const sizes = { js: 0, jsGzip: 0, css: 0, cssGzip: 0 };
  for (const file of files) {
    const data = fs.readFileSync(path.join(directory, file));
    const type = file.endsWith('.css') ? 'css' : 'js';
    sizes[type] += data.length;
    sizes[`${type}Gzip`] += gzipSync(data).length;
  }
  result[entry] = sizes;
}
console.log(JSON.stringify(result, null, 2));
