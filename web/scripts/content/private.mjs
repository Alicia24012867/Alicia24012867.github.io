import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './paths.mjs';

/**
 * The site's documents for the blog API (server/), which needs two things a static site can't
 * give it: which pages there are, so it takes comments and likes for those alone, and the text
 * of locked documents, which it shows to signed-in readers whose groups reach their level.
 *
 * Each build writes them to dist-private/, beside dist/ and never inside it. The deploy hands
 * that folder to the server as the release's private/ part, which only the API reads:
 *
 *   manifest.json             every page; the levels; each file's type and level
 *   documents/<hash>.json     a locked document's reading payload, as the API answers it
 *   files/<hash>.<extension>  a photo, a smaller copy of one, or an attachment
 *
 * docs/api/README.md describes it, and PrivateManifest in docs/api/openapi.yaml checks it.
 */

/** A bundle of made-up documents, for the stand-in API and the contract tests of the backend. */
export const fixtureBundle = path.join(repoRoot, 'docs/api/fixtures/private');
/** Where the API serves the photos and attachments of locked documents. */
export const PRIVATE_FILES = '/api/private/files/';
export const PRIVATE_VERSION = 1;
/** Without access.yml, locked documents have one level: the sign-in service's group of friends. */
export const DEFAULT_LEVEL = 'friends';
// A reader reaches a level through the group of the same name, so it is named as groups are.
const levelName = /^[a-z][a-z0-9-]{0,31}$/;

const types = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  zip: 'application/zip',
};
/** The type a file in the bundle is served with, from its extension. */
export const privateType = (name) =>
  types[path.extname(name).slice(1)] ?? 'application/octet-stream';

/** A name made from `data`, as built assets are named, keeping a plain extension. */
export function privateName(data, extension = '') {
  const digest = crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  const kept = /^\.[a-z0-9]{1,10}$/.test(extension.toLowerCase())
    ? extension.toLowerCase()
    : '.bin';
  return digest + kept;
}

/**
 * The bundle of `collections`, each a content plugin's api: `manifest`, each locked document's
 * text by its name in the bundle, and the source file of each photo or attachment by its name.
 */
export async function privateBundle(collections, warn) {
  const parts = await Promise.all(
    collections.map((collection) => collection.readPrivate(PRIVATE_FILES, warn)),
  );
  // Blog and Notes read the same access.yml.
  const named = parts.find((part) => part.levels.length)?.levels ?? [];
  const levels = named.length ? named : [DEFAULT_LEVEL];
  // Build logs are public, so this names no level.
  if (!levels.every((level) => levelName.test(level)))
    throw new Error(
      'content/locked/access.yml: 等级名要和登录服务里的分组名相同，以小写字母开头，只用小写字母、数字和 -',
    );
  const pages = [];
  const documents = new Map();
  const files = new Map();
  // A file shown by documents of several levels opens for the lowest of them.
  const fileLevels = new Map();
  for (const part of parts) {
    for (const [name, file] of part.files) files.set(name, file);
    for (const { path: pagePath, title, date, level, payload, files: used } of part.documents) {
      const page = { path: pagePath, title, date, level: level === null ? null : levels[level] };
      if (payload) {
        const source = JSON.stringify(payload);
        page.document = `documents/${privateName(source, '.json')}`;
        documents.set(page.document, source);
        for (const name of used)
          fileLevels.set(name, Math.min(fileLevels.get(name) ?? Infinity, level));
      }
      pages.push(page);
    }
  }
  const manifest = {
    version: PRIVATE_VERSION,
    levels,
    pages,
    files: Object.fromEntries(
      [...fileLevels.keys()]
        .sort()
        .map((name) => [name, { type: privateType(name), level: levels[fileLevels.get(name)] }]),
    ),
  };
  return { manifest, documents, files };
}

/** Writes a bundle to `directory`, in place of what was there; only its owner reads it. */
export function writePrivate(directory, { manifest, documents, files }) {
  fs.rmSync(directory, { recursive: true, force: true });
  for (const folder of ['documents', 'files'])
    fs.mkdirSync(path.join(directory, folder), { recursive: true, mode: 0o700 });
  const write = (name, data) => fs.writeFileSync(path.join(directory, name), data, { mode: 0o600 });
  write('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [name, source] of documents) write(name, source);
  for (const [name, file] of files) write(path.join('files', name), fs.readFileSync(file));
}

/** A bundle as writePrivate left it, such as docs/api/fixtures/private. */
export function readPrivate(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const documents = new Map();
  for (const { document } of manifest.pages)
    if (document) documents.set(document, fs.readFileSync(path.join(directory, document), 'utf8'));
  const files = new Map(
    Object.keys(manifest.files).map((name) => [name, path.join(directory, 'files', name)]),
  );
  return { manifest, documents, files };
}

/**
 * Writes the bundle to `directory`, from the Vite root, after each build. `api.readBundle`
 * gives the same bundle without writing it, for the stand-in API of the dev server.
 */
export function privatePlugin(collections, { directory = 'dist-private' } = {}) {
  let outDir;
  let logger;
  let catalogs = [];
  let bundle;
  const readBundle = (warn = (message) => logger.warn(message)) => {
    const current = collections.map(({ readCatalog }) => readCatalog());
    if (!bundle || current.some((catalog, index) => catalog !== catalogs[index])) {
      catalogs = current;
      bundle = privateBundle(collections, warn);
    }
    return bundle;
  };
  return {
    name: 'site-private',
    api: { readBundle },
    configResolved(config) {
      logger = config.logger;
      outDir = path.resolve(config.root, directory);
      const dist = path.resolve(config.root, config.build.outDir);
      const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
      // Everything in dist is published, on GitHub Pages too.
      if (inside(outDir, dist) || inside(dist, outDir))
        throw new Error('私有目录不能和网站的构建目录重叠');
    },
    async writeBundle() {
      writePrivate(outDir, await readBundle((message) => this.warn(message)));
    },
  };
}
