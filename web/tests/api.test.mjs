import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { checkApi } from '../scripts/api/check.mjs';
import { readContract } from '../scripts/api/contract.mjs';
import { startMockApi } from '../scripts/api/mock.mjs';
import { fixtureBundle, privateName, readPrivate } from '../scripts/content/private.mjs';

test('the made-up private bundle is one the contract describes', () => {
  const { manifest, documents, files } = readPrivate(fixtureBundle);
  assert.deepEqual(readContract().validate('PrivateManifest', manifest), []);
  for (const page of manifest.pages) {
    assert.equal(!!page.document, page.level !== null, page.path);
    if (page.document) assert.equal(JSON.parse(documents.get(page.document)).slug.length > 0, true);
  }
  for (const [name, file] of files) {
    assert.equal(privateName(fs.readFileSync(file), path.extname(name)), name);
    assert.ok(manifest.levels.includes(manifest.files[name].level), name);
  }
  // Every level has a document, so the checks can tell levels apart.
  for (const level of manifest.levels)
    assert.ok(
      manifest.pages.some((page) => page.level === level),
      level,
    );
});

test('the stand-in API passes every check of the contract', async () => {
  const mock = await startMockApi({ port: 0, log: () => {} });
  try {
    const lines = [];
    const counts = await checkApi(mock.url, { log: (line) => lines.push(line) });
    assert.equal(counts.failed, 0, lines.join('\n'));
    assert.equal(counts.skipped, 0, lines.join('\n'));
    assert.ok(counts.passed > 40, `only ${counts.passed} checks ran`);
  } finally {
    await mock.close();
  }
});

test('a backend that only answers /api/health passes, with nothing else checked', async () => {
  const lines = [];
  const server = (await import('node:http')).createServer((req, res) => {
    res.writeHead(req.url === '/api/health' ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: 'test', features: [] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const counts = await checkApi(`http://127.0.0.1:${server.address().port}`, {
      log: (line) => lines.push(line),
    });
    assert.deepEqual(counts, { passed: 1, failed: 0, skipped: 0 }, lines.join('\n'));
  } finally {
    server.close();
  }
});

test('a wrong answer is reported, with what the contract wanted', async () => {
  const lines = [];
  const server = (await import('node:http')).createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: 'yes', features: [] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const counts = await checkApi(`http://127.0.0.1:${server.address().port}`, {
      log: (line) => lines.push(line),
    });
    assert.equal(counts.failed, 1);
    const said = lines.join('\n');
    assert.match(said, /\/ok must be equal to constant/);
    assert.match(said, /must have required property 'version'/);
  } finally {
    server.close();
  }
});
