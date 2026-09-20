import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { buildArticleCatalog } from './content/catalog.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alicia-content-bench-'));
const count = 200;
const samples = 9;
const cache = new Map();
const watchedCache = new Map();
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
try {
  for (let index = 0; index < count; index++)
    fs.writeFileSync(path.join(root, `note-${index}.md`), sample(index), 'utf8');
  const full = Array.from({ length: samples }, () => measure(() => buildArticleCatalog(root)));
  buildArticleCatalog(root, undefined, { cache });
  buildArticleCatalog(root, undefined, { cache: watchedCache });
  const incremental = [];
  const watched = [];
  for (let index = 0; index < samples; index++) {
    fs.writeFileSync(path.join(root, 'note-0.md'), `${sample(0)}\n\nEdit ${index}`, 'utf8');
    const reread = () =>
      incremental.push(measure(() => buildArticleCatalog(root, undefined, { cache })));
    const fromEvents = () =>
      watched.push(
        measure(() =>
          buildArticleCatalog(root, undefined, {
            cache: watchedCache,
            changedFiles: new Set(['note-0.md']),
          }),
        ),
      );
    // Alternate order to reduce filesystem cache and scheduling bias.
    if (index % 2) {
      fromEvents();
      reread();
    } else {
      reread();
      fromEvents();
    }
  }
  console.log(
    JSON.stringify(
      {
        documents: count,
        samples,
        proseCharactersPerDocument: paragraph.length,
        fullMedianMs: median(full),
        singleEditMedianMs: median(incremental),
        speedup: median(full) / median(incremental),
        watchedEditMedianMs: median(watched),
        watchedSpeedup: median(full) / median(watched),
      },
      null,
      2,
    ),
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
