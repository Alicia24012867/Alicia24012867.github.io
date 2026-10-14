import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createSharePage } from './content/share.mjs';

// The production shell carries every tag a share page rewrites; build once before measuring.
const shellArg = process.argv.slice(2).find((arg, index, args) => {
  return !arg.startsWith('--') && args[index - 1] !== '--compare-ref';
});
const shellFile = path.resolve(shellArg || 'dist/blog/index.html');
if (!fs.existsSync(shellFile)) throw new Error(`Missing ${shellFile}; run npm run build first`);
const shell = fs.readFileSync(shellFile, 'utf8');
const options = { siteUrl: 'https://nymphilia.com/', basePath: '/blog/' };

const variants = [{ name: 'current', render: createSharePage(shell, options) }];
const compareArg = process.argv.indexOf('--compare-ref');
if (compareArg !== -1) {
  const ref = process.argv[compareArg + 1];
  if (!ref || ref.startsWith('--')) throw new Error('--compare-ref requires a Git revision');
  // Compare page builders with the same card rules and dependencies.
  const source = execFileSync('git', ['show', `${ref}:scripts/content/share.mjs`], {
    encoding: 'utf8',
  })
    .replace("from 'entities'", `from ${JSON.stringify(import.meta.resolve('entities'))}`)
    .replace(
      /from '(\.{1,2}\/[^']+)'/g,
      (_, file) =>
        `from ${JSON.stringify(new URL(file, import.meta.resolve('./content/share.mjs')).href)}`,
    );
  const baseline = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  // Older revisions render one page per call instead of compiling the shell first.
  const render = baseline.createSharePage
    ? baseline.createSharePage(shell, options)
    : (article, card) => baseline.sharePageHtml(shell, article, { ...options, card });
  variants.unshift({ name: ref, render });
}
const articles = Array.from({ length: 10000 }, (_, i) => ({
  slug: `nested/post-${i}`,
  title: `Title ${i} & <notes>`,
  description: i % 4 ? `Summary ${i % 97}` : '',
  author: 'Alicia',
  tags: Array.from({ length: i % 4 }, (_, tag) => `tag-${(i + tag) % 23}`),
  date: new Date(Date.UTC(2020, 0, 1) + ((i * 7919) % 2000) * 86400000).toISOString(),
  updated: i % 3 ? '' : '2026-02-03T12:00:00+08:00',
  section: ['stream', 'notes', 'life'][i % 3],
}));
const cards = articles.map(({ slug }) => ({ url: `/images/share/blog/${slug}.0123456789.jpg` }));
const renderAll = (render) => articles.map((article, index) => render(article, cards[index]));

const expected = renderAll(variants.at(-1).render);
for (const variant of variants) {
  assert.deepEqual(renderAll(variant.render), expected, `${variant.name} renders other pages`);
  variant.times = [];
  for (let i = 0; i < 3; i++) renderAll(variant.render);
}
const samples = 11;
for (let i = 0; i < samples; i++) {
  for (const variant of i % 2 ? [...variants].reverse() : variants) {
    const start = performance.now();
    renderAll(variant.render);
    variant.times.push(performance.now() - start);
  }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
console.log(
  JSON.stringify(
    {
      node: process.version,
      shellBytes: Buffer.byteLength(shell),
      documents: articles.length,
      samples,
      results: Object.fromEntries(variants.map(({ name, times }) => [name, median(times)])),
    },
    null,
    2,
  ),
);
