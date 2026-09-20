import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { buildArticleCatalog } from './content/catalog.mjs';

const variants = [{ name: 'current', build: buildArticleCatalog }];
const withGit = process.argv.includes('--git');
const compareArg = process.argv.indexOf('--compare-ref');
if (compareArg !== -1) {
  const ref = process.argv[compareArg + 1];
  if (!ref || ref.startsWith('--')) throw new Error('--compare-ref requires a Git revision');
  // Compare catalog implementations with the same compiler and dependencies.
  const source = execFileSync('git', ['show', `${ref}:scripts/content/catalog.mjs`], {
    encoding: 'utf8',
  })
    .replace("from 'entities'", `from ${JSON.stringify(import.meta.resolve('entities'))}`)
    .replace(
      /from '\.\/([^']+)'/g,
      (_, file) => `from ${JSON.stringify(import.meta.resolve(`./content/${file}`))}`,
    );
  const baseline = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  variants.unshift({ name: ref, build: baseline.buildArticleCatalog });
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alicia-content-bench-'));
const count = 200;
const samples = 9;
const paragraph = 'A repeatable note about numerical methods and memory access. '.repeat(
  process.argv.includes('--long') ? 300 : 20,
);
const sample = (index) =>
  `---\ntitle: Note ${index}\ndescription: Benchmark fixture\n---\n## Formula\n\n$x^2+y^2$\n\n${paragraph}\n\n\`\`\`cpp\nint value = 42;\n\`\`\`\n\n[Next](note-${(index + 1) % count}.md)`;
function measure(build) {
  const start = performance.now();
  build();
  return performance.now() - start;
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const ordered = (index) => (index % 2 ? [...variants].reverse() : variants);
try {
  for (let index = 0; index < count; index++)
    fs.writeFileSync(path.join(root, `note-${index}.md`), sample(index), 'utf8');
  if (withGit) {
    const git = (args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    git(['init']);
    git(['add', '.']);
    git([
      '-c',
      'user.name=Benchmark',
      '-c',
      'user.email=benchmark@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      'Initial content',
    ]);
  }
  for (const variant of variants) {
    Object.assign(variant, {
      cache: new Map(),
      watchedCache: new Map(),
      full: [],
      incremental: [],
      watched: [],
    });
    variant.build(root); // Warm up compilation before timing either implementation.
  }
  for (let index = 0; index < samples; index++)
    for (const variant of ordered(index)) variant.full.push(measure(() => variant.build(root)));
  for (const variant of variants) {
    variant.build(root, undefined, { cache: variant.cache });
    variant.build(root, undefined, { cache: variant.watchedCache });
  }
  for (let index = 0; index < samples; index++) {
    fs.writeFileSync(path.join(root, 'note-0.md'), `${sample(0)}\n\nEdit ${index}`, 'utf8');
    let expected;
    for (const variant of ordered(index)) {
      let rereadResult;
      let watchedResult;
      const reread = () =>
        variant.incremental.push(
          measure(() => {
            rereadResult = variant.build(root, undefined, { cache: variant.cache });
          }),
        );
      const fromEvents = () =>
        variant.watched.push(
          measure(() => {
            watchedResult = variant.build(root, undefined, {
              cache: variant.watchedCache,
              changedFiles: new Set(['note-0.md']),
            });
          }),
        );
      // Alternate both implementation and cached-mode order to reduce timing bias.
      if (index % 2) {
        fromEvents();
        reread();
      } else {
        reread();
        fromEvents();
      }
      assert.deepEqual(watchedResult, rereadResult);
      if (expected) assert.deepEqual(rereadResult, expected);
      expected = rereadResult;
    }
  }
  const results = variants.map((variant) => ({
    implementation: variant.name,
    fullMedianMs: median(variant.full),
    singleEditMedianMs: median(variant.incremental),
    speedup: median(variant.full) / median(variant.incremental),
    watchedEditMedianMs: median(variant.watched),
    watchedSpeedup: median(variant.full) / median(variant.watched),
  }));
  console.log(
    JSON.stringify(
      {
        documents: count,
        samples,
        withGit,
        proseCharactersPerDocument: paragraph.length,
        ...(compareArg === -1 ? results[0] : { results }),
      },
      null,
      2,
    ),
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
