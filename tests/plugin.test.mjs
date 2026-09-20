import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { articlesPlugin } from '../scripts/content/plugin.mjs';

test('Vite development mode transforms the virtual catalog without treating directories as imports', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'alicia-vite-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'content/blog'), { recursive: true });
  writeFileSync(path.join(root, 'content/blog', 'note.md'), '# Dev preview\n\nHello.');
  const server = await createServer({
    root,
    configFile: false,
    plugins: [articlesPlugin()],
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
  mkdirSync(path.join(root, 'content/blog'), { recursive: true });
  mkdirSync(path.join(root, 'content/notes/formulas'), { recursive: true });
  writeFileSync(path.join(root, 'content/blog', 'blog-only.md'), '# Blog exclusive');
  writeFileSync(
    path.join(root, 'content/notes/formulas', 'first.md'),
    '# Notes exclusive\n\n[Math](second.md)',
  );
  writeFileSync(path.join(root, 'content/notes/formulas', 'second.md'), '# Math note\n\n$x^2$');
  const server = await createServer({
    root,
    configFile: false,
    plugins: [
      articlesPlugin(),
      articlesPlugin({
        directory: 'content/notes',
        moduleId: 'virtual:notes',
        basePath: '/notes/',
      }),
    ],
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
    assert.doesNotMatch(notes.code, /<p>|<span|katex/);
    const first = await server.transformRequest('virtual:notes/entry/formulas%2Ffirst');
    const second = await server.transformRequest('virtual:notes/entry/formulas%2Fsecond');
    assert.match(first.code, /\?post=formulas%2Fsecond/);
    assert.match(second.code, /katex/);
    assert.doesNotMatch(first.code, /katex/);
  } finally {
    await server.close();
  }
});

test('cached lazy modules refresh bodies and search text after a watched edit', async (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'alicia-lazy-edit-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'content/blog');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'note.md');
  writeFileSync(file, '---\ndescription: Fixed summary\n---\n# Title\n\nBefore edit.');
  const plugin = articlesPlugin();
  const server = await createServer({
    root,
    configFile: false,
    plugins: [plugin],
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const listing = await server.transformRequest('virtual:articles');
    assert.doesNotMatch(listing.code, /Before edit/);
    assert.match(
      (await server.transformRequest('virtual:articles/entry/note')).code,
      /Before edit/,
    );
    writeFileSync(file, '---\ndescription: Fixed summary\n---\n# Title\n\nAfter edit.');
    server.watcher.emit('change', file);
    assert.match((await server.transformRequest('virtual:articles/entry/note')).code, /After edit/);
    assert.match((await server.transformRequest('virtual:articles/search')).code, /after edit/);
    await assert.rejects(
      server.transformRequest('virtual:articles/entry/missing'),
      /Unknown article/,
    );
    const added = path.join(directory, 'added.md');
    writeFileSync(added, '# Added document\n\n[Original](note.md)');
    writeFileSync(file, '# Revised original\n\n[Added](added.md)');
    server.watcher.emit('add', added);
    server.watcher.emit('change', file);
    const updatedListing = (await server.transformRequest('virtual:articles')).code;
    assert.match(updatedListing, /Added document/);
    assert.match(updatedListing, /Revised original/);
    const revised = (await server.transformRequest('virtual:articles/entry/note')).code;
    assert.match(revised, /post=added/);
    assert.match(revised, /backlinks.*added/);
    rmSync(added);
    writeFileSync(file, '# Original without link');
    server.watcher.emit('unlink', added);
    server.watcher.emit('change', file);
    assert.doesNotMatch((await server.transformRequest('virtual:articles')).code, /Added document/);
    await assert.rejects(
      server.transformRequest('virtual:articles/entry/added'),
      /Unknown article/,
    );
  } finally {
    await server.close();
  }
});
