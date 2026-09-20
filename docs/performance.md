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
