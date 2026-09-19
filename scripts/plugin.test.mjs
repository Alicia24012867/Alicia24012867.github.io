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
