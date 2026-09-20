import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { build, createServer, preview } from 'vite';
import { articlesPlugin } from '../scripts/content/plugin.mjs';
import { notFoundPlugin } from '../scripts/not-found.mjs';

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

for (const mode of ['development', 'preview']) {
  test(`${mode} serves unknown paths with the custom 404 and preserves real pages`, async (t) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'alicia-404-test-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const directory of ['blog', 'notes', 'public/images'])
      mkdirSync(path.join(root, directory), { recursive: true });
    for (const file of ['index.html', 'blog/index.html', 'notes/index.html'])
      writeFileSync(path.join(root, file), `<html><head></head><body>${file}</body></html>`);
    writeFileSync(
      path.join(root, 'public/images/sky.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    writeFileSync(
      path.join(root, '404.html'),
      '<html><head><title>Page not found</title></head><body><h1>404</h1><img src="%BASE_URL%images/sky.svg"><a href="/">Home</a><a href="/blog/">Blog</a><a href="/notes/">Notes</a></body></html>',
    );
    let transforms = 0;
    const config = {
      root,
      configFile: false,
      appType: 'mpa',
      base: '/',
      logLevel: 'silent',
      plugins: [
        notFoundPlugin(),
        {
          name: 'count-html-transforms',
          transformIndexHtml(html, context) {
            if (context.path === '/404.html') transforms++;
            return html;
          },
        },
      ],
    };
    let httpServer;
    let close;
    if (mode === 'development') {
      const server = await createServer({
        ...config,
        server: { host: '127.0.0.1', port: 0, hmr: false, ws: false, watch: null },
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      await server.listen();
      httpServer = server.httpServer;
      close = () => server.close();
    } else {
      await build({
        ...config,
        build: {
          rolldownOptions: {
            input: ['index.html', 'blog/index.html', 'notes/index.html', '404.html'].map((file) =>
              path.join(root, file),
            ),
          },
        },
      });
      const server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
      httpServer = server.httpServer;
      close = () => new Promise((resolve) => httpServer.close(resolve));
    }
    t.after(close);
    const origin = `http://127.0.0.1:${httpServer.address().port}`;
    const templatePath = path.join(root, mode === 'preview' ? 'dist/404.html' : '404.html');
    let reads = 0;
    let failNextRead = false;
    transforms = 0;
    const readFile = fs.readFile;
    t.mock.method(fs, 'readFile', (...args) => {
      if (args[0] === templatePath) {
        reads++;
        if (failNextRead) {
          failNextRead = false;
          return Promise.reject(new Error('Temporary template read failure'));
        }
      }
      return readFile(...args);
    });
    const head = await fetch(`${origin}/missing/deep/`, { method: 'HEAD' });
    assert.equal(head.status, 404);
    assert.equal(await head.text(), '');
    assert.equal(reads, 0, 'HEAD does not read the template');
    assert.equal(transforms, 0, 'HEAD does not transform HTML');
    const missing = [
      '/typo',
      '/missing/',
      '/blog/missing',
      '/notes/deep/missing/?post=example&q=GPU',
      '/nested/missing.html',
      '/%E4%B8%8D%E5%AD%98%E5%9C%A8/',
    ];
    const responses = await Promise.all(
      missing.map((pathname) => fetch(origin + pathname, { headers: { Accept: 'text/html' } })),
    );
    for (const [index, response] of responses.entries()) {
      const pathname = missing[index];
      assert.equal(response.status, 404, pathname);
      assert.equal(response.redirected, false, pathname);
      assert.match(response.headers.get('content-type'), /text\/html/);
      const html = await response.text();
      assert.match(html, /<h1>404<\/h1>/);
      assert.match(html, /src="\/images\/sky.svg"/);
      for (const target of ['/', '/blog/', '/notes/']) assert.ok(html.includes(`href="${target}"`));
    }
    const repeat = await fetch(`${origin}/missing/`);
    assert.equal(repeat.status, 404);
    await repeat.text();
    assert.equal(reads, 1, 'concurrent and repeated misses share one template read');
    assert.equal(transforms, mode === 'development' ? 1 : 0);

    const html = await readFile(templatePath, 'utf8');
    writeFileSync(templatePath, `${html}<!-- edited -->`);
    const edited = await fetch(`${origin}/missing/`);
    assert.equal(edited.status, 404);
    assert.match(await edited.text(), /<!-- edited -->/);
    assert.equal(reads, 2, 'development edits and preview rebuilds invalidate the cache');
    assert.equal(transforms, mode === 'development' ? 2 : 0);

    const previous = await fs.stat(templatePath);
    writeFileSync(templatePath, `${html}<!-- latest -->`);
    await fs.utimes(templatePath, previous.atime, new Date(previous.mtimeMs + 1000));
    const sameSizeEdit = await fetch(`${origin}/missing/`);
    assert.equal(sameSizeEdit.status, 404);
    assert.match(await sameSizeEdit.text(), /<!-- latest -->/);
    assert.equal(reads, 3, 'same-size edits also invalidate the cache');

    writeFileSync(templatePath, `${html}<!-- recovered -->`);
    failNextRead = true;
    const failed = await fetch(`${origin}/missing/`);
    assert.equal(failed.status, 500);
    await failed.text();
    const recovered = await fetch(`${origin}/missing/`);
    assert.equal(recovered.status, 404);
    assert.match(await recovered.text(), /<!-- recovered -->/);
    assert.equal(reads, 5, 'a rejected template read can be retried');
    for (const pathname of ['/', '/blog/', '/notes/', '/notes/?post=missing', '/404.html']) {
      const response = await fetch(origin + pathname);
      assert.equal(response.status, 200, pathname);
      assert.match(await response.text(), /<html>/);
    }
    const asset = await fetch(`${origin}/images/sky.svg`);
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /<svg/);
    const data = await fetch(`${origin}/missing.json`, { headers: { Accept: 'application/json' } });
    assert.equal(data.status, 404);
    assert.doesNotMatch(await data.text(), /<h1>404/);
    const post = await fetch(`${origin}/missing/`, { method: 'POST' });
    assert.equal(post.status, 404);
    assert.doesNotMatch(await post.text(), /<h1>404/);
  });
}
