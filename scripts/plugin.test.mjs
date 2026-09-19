import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { articlesPlugin } from './articles-plugin.mjs';

test('Vite development mode transforms the virtual catalog without treating directories as imports', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'alicia-vite-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'articles'));
  writeFileSync(path.join(root, 'articles', 'note.md'), '# Dev preview\n\nHello.');
  const server = await createServer({
    root, configFile: false, plugins: [articlesPlugin()],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const result = await server.transformRequest('virtual:articles');
    assert.match(result.code, /Dev preview/);
    assert.match(result.code, /export default articles/);
  } finally {
    await server.close();
  }
});

test('Notes and Blog stay isolated while note links and math compile within Notes', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'alicia-notes-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'articles'));
  mkdirSync(path.join(root, 'notes/content/formulas'), { recursive: true });
  writeFileSync(path.join(root, 'articles', 'blog-only.md'), '# Blog exclusive');
  writeFileSync(path.join(root, 'notes/content/formulas', 'first.md'), '# Notes exclusive\n\n[Math](second.md)');
  writeFileSync(path.join(root, 'notes/content/formulas', 'second.md'), '# Math note\n\n$x^2$');
  const server = await createServer({
    root, configFile: false,
    plugins: [articlesPlugin(), articlesPlugin({ directory: 'notes/content', moduleId: 'virtual:notes' })],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const blog = await server.transformRequest('virtual:articles');
    const notes = await server.transformRequest('virtual:notes');
    assert.match(blog.code, /Blog exclusive/);
    assert.doesNotMatch(blog.code, /Notes exclusive/);
    assert.match(notes.code, /Notes exclusive/);
    assert.doesNotMatch(notes.code, /Blog exclusive/);
    assert.match(notes.code, /\?post=formulas%2Fsecond/);
    assert.match(notes.code, /katex/);
  } finally {
    await server.close();
  }
});
