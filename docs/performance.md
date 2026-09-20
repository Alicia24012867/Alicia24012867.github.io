# Performance

Measured locally on 2026-09-20 with Node.js 24.14.0 and the current sample content. The baseline is the workspace build immediately before this optimization round, including the earlier refactor; it is not the last Git commit.

## Initial page assets

`measure-bundle.mjs` follows each entry's static imports in the Vite manifest, deduplicates files, and totals JavaScript and CSS bytes. Gzip totals compress each file separately. Dynamic imports, HTML, images, fonts, HTTP headers, and browser cache effects are excluded. These are asset sizes, not page-load timings.

| Page          | Before (bytes) | After (bytes) | Change | Gzip before (bytes) | Gzip after (bytes) | Gzip change |
| ------------- | -------------: | ------------: | -----: | ------------------: | -----------------: | ----------: |
| Home          |        243,305 |       243,341 | +0.01% |              74,355 |             74,876 |       +0.7% |
| Blog listing  |        310,324 |       224,642 | −27.6% |              93,737 |             71,334 |      −23.9% |
| Notes listing |        311,944 |       226,573 | −27.4% |              92,480 |             72,233 |      −21.9% |

The homepage remains effectively unchanged; splitting CSS slightly increases its compressed total. Reader pages also load the selected document and reader chunks. Formula styles and Mermaid are additional conditional downloads.

## Content compilation

The benchmark generates 200 Markdown documents with formulas, highlighted code, prose, and cross-links. It takes nine samples per mode and reports medians. The two cached modes run in alternating order after each edit to reduce filesystem cache and scheduling bias. The default fixture has 1,220 prose characters per document; `--long` uses 18,300.

| Operation                              | Short documents | Long documents |
| -------------------------------------- | --------------: | -------------: |
| Full catalog compilation               |        47.57 ms |      192.11 ms |
| Cached compilation, reread all sources |         9.49 ms |       13.22 ms |
| Cached compilation, watcher changes    |         4.09 ms |        7.03 ms |

Using watcher changes reduced cached update time by **57%** for short documents and **47%** for long documents in this local run. These measurements cover catalog compilation, not the complete Vite build or browser refresh. Absolute timings vary with filesystem cache and machine load.

The Vite plugin supplies changed paths relative to the content root. Only that complete change set permits skipping unchanged source reads; standalone builds and build restarts reread all sources. Attachment existence and paths, article targets, and backlinks are checked on every catalog build. Parsed outgoing links are cached with the source and collection base path.

## Changes

- Listings contain metadata only. Each document body is a separate dynamic import; Notes loads its full-text index on the first nonempty search.
- Homepage data and styles stay in the home entry. Reader styles load with the reader; KaTeX styles load only for documents containing formulas.
- HTML declares the font stylesheet and preconnects directly, removing the CSS `@import` discovery step. The homepage preloads its existing hero image before React renders it. Font families and weights are unchanged.
- Search filtering uses deferred updates and memoized entries. Topic and section groups reuse the catalog indexes.
- The table of contents caches heading positions and uses binary search during scrolling. Resize, disclosure, and font events invalidate the cache.
- Mermaid loads near the viewport and reuses rendered SVGs when returning to a theme. Complex diagram engines remain large deferred chunks.
- Development rebuilds reuse unchanged compiled documents and parsed link targets, and watcher events avoid rereading unchanged sources.
- Failed body or search downloads offer a page reload, preserving the URL and avoiding a cached failed module import.

## Reproduce and verify

```sh
npm ci
npm run check
npm run format:check
npm run bundle:report
node scripts/benchmark-content.mjs
node scripts/benchmark-content.mjs --long
```

To compare saved builds, run `node scripts/measure-bundle.mjs /path/to/build` against each directory containing `.vite/manifest.json`.

Validation: 43 tests, TypeScript, formatting, and production build checks passed. Tests cover consecutive watcher edits, additions/deletions, cache invalidation, collection changes, and prototype-named search entries. The build guard checks that entry import graphs exclude document bodies, readers, Mermaid, and formula styles, and that documents remain separate dynamic entries. Browser checks covered full-text search, formulas, Mermaid visibility and theme caching, failed-download recovery, anchor navigation after reload, resource hints, and 320–375px layouts. Production network timings and Core Web Vitals were not measured.

## Follow-up optimization (2026-09-20)

This round compares against commit `e2b2db4`, which already includes the first round above. Node.js remains 24.14.0. The changes target incremental content compilation and repeated search queries.

### Content discovery and validation

Directory discovery now uses directory entries to identify regular files, skips private directory trees before descending, and resolves paths through native `realpath`. Shared attachments are validated once per catalog build. Validation is never cached across builds: missing attachments, changed symlink destinations, unpublished targets, and backlinks are still checked after edits. Directory symlinks remain untraversed; file symlinks retain containment checks.

The benchmark's `--compare-ref` option runs the old and new catalog implementations against the same fixtures, compiler, and dependencies. Both are warmed up, implementation and cached-mode order alternate, and cached results are checked for equality outside the timed region. Each run takes nine samples per mode. The following values are the median of three run medians, in milliseconds:

| Operation                              | Short before | Short after | Long before | Long after |
| -------------------------------------- | -----------: | ----------: | ----------: | ---------: |
| Full catalog compilation               |        44.79 |       41.74 |      185.65 |     181.78 |
| Cached compilation, reread all sources |         6.79 |        5.46 |       15.47 |       6.99 |
| Cached compilation, watcher changes    |         3.33 |        2.56 |        3.94 |       3.47 |

Cached reread times fell by approximately **20% / 55%** for short / long documents, and watcher updates by **23% / 12%**. Full compilation showed only a small aggregate change, and one long-document run was slower after the change. These local measurements fluctuate with filesystem cache, garbage collection, and machine load; they do not establish a full production-build speedup.

### Search and list rendering

Search keeps only the latest normalized query and result. When the next query contains the previous query, it filters those existing matches. Deleting or replacing the query falls back to the complete index when needed; equivalent queries reuse their result. Existing result arrays remain intact. Blog and Notes memoize each group of entries so urgent input updates can skip walking unchanged lists while a deferred search is pending.

`benchmark-search.mjs` compares the previous full-scan algorithm with the narrowed search over 10,000 synthetic notes, each with 1,220 prose characters. Four percent of titles contain `CUDA memory`. Each sample uses 14 queries covering typing, normalization, deletion, replacement, no matches, and clearing. Both paths are warmed up, run in alternating order for nine samples, and checked for equivalent results. A local run measured **60.27 ms → 20.11 ms** per sequence, approximately **3×** faster. This measures synchronous filtering only, excluding index creation, React rendering, browser input latency, and downloads. Gains depend on query selectivity; the site's current small sample collection will benefit much less.

### Asset cost and validation

The homepage's initial assets are unchanged. Blog and Notes each add 148 uncompressed JavaScript bytes; their compressed initial JS/CSS totals change from 71,334 to 71,390 bytes and 72,233 to 72,282 bytes respectively. CSS is unchanged, and existing lazy-loading build guards still pass.

All 46 tests, TypeScript checks, production build checks, formatting, and diff whitespace checks passed. Added regression coverage includes private-directory pruning, file and directory symlinks, shared-attachment validation, symlink replacement between cached builds, and successive search edits. Browser verification was subsequently completed against the production preview after the approval service became available. Notes checks covered successive query input, replacing a no-match query, a body-only match (`stream`), reload and browser-back restoration, keyboard clearing, and opening the selected note. Blog checks covered tag filtering, no-match results, clearing through “View all posts”, and asynchronous article loading. Formula layout, TOC navigation and hash restoration after reload, and Mermaid rendering near the viewport were visually verified. No application warnings or errors appeared in the captured browser logs. These checks used the existing sample content and default desktop viewport; they do not measure React render time, large-list input latency, network download timing, or Core Web Vitals.

Reproduce the follow-up measurements:

```sh
node scripts/benchmark-content.mjs --compare-ref e2b2db4
node scripts/benchmark-content.mjs --compare-ref e2b2db4 --long
node --experimental-strip-types scripts/benchmark-search.mjs
npm run check
npm run format:check
npm run bundle:report
```

Repeat the two catalog commands three times to reproduce the aggregation method. The comparison option loads the historical catalog implementation only; it is not a benchmark of the complete historical repository.

## Navigation follow-up

The subsequent navigation change adds a shared header across Home, Blog, and Notes, including direct links to homepage sections and a mobile menu. Filtered article links carry `q`; reader return links restore that filter without browser-history or storage dependencies. Cross-page homepage anchors are applied after React mounts the sections.

Validation: 48 tests, TypeScript, the production build and lazy-loading guard, formatting, and diff checks passed. Browser checks covered a Notes body-text filter followed by article load, reload, and return; a Chinese Blog tag and both reader return links; cross-collection navigation; 320px and 375px mobile menus; menu focus and Escape restoration; and a homepage anchor positioned below the sticky header. Captured browser logs contained no warnings or errors. Asset figures in the performance-only section above precede this navigation change.
