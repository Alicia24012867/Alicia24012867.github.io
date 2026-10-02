import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import { sortArticles } from '../src/content/sort.ts';

const variants = [{ name: 'current', sort: sortArticles }];
const compareArg = process.argv.indexOf('--compare-ref');
if (compareArg !== -1) {
  const ref = process.argv[compareArg + 1];
  if (!ref || ref.startsWith('--')) throw new Error('--compare-ref requires a Git revision');
  const source = execFileSync('git', ['show', `${ref}:src/content/sort.ts`], { encoding: 'utf8' });
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const baseline = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);
  variants.unshift({ name: ref, sort: baseline.sortArticles });
}
const articles = Array.from({ length: 10000 }, (_, i) => ({
  slug: `post-${i}`,
  title: `Title ${i % 37}`,
  date: new Date(Date.UTC(2020, 0, 1) + ((i * 7919) % 2000) * 86400000).toISOString(),
  updated:
    i % 3 ? '' : new Date(Date.UTC(2026, 0, 1) + ((i * 3571) % 250) * 86400000).toISOString(),
  pin: i % 53 === 0,
}));
const samples = 11;
const results = {};
for (const order of ['newest', 'oldest', 'updated', 'title']) {
  const expected = sortArticles(articles, order);
  for (const variant of variants) {
    assert.deepEqual(variant.sort(articles, order), expected);
    variant.times = [];
    for (let i = 0; i < 3; i++) variant.sort(articles, order);
  }
  for (let i = 0; i < samples; i++) {
    for (const variant of i % 2 ? [...variants].reverse() : variants) {
      const start = performance.now();
      variant.sort(articles, order);
      variant.times.push(performance.now() - start);
    }
  }
  results[order] = Object.fromEntries(
    variants.map(({ name, times }) => [name, times.sort((a, b) => a - b)[Math.floor(samples / 2)]]),
  );
}
console.log(
  JSON.stringify({ node: process.version, documents: articles.length, samples, results }, null, 2),
);
