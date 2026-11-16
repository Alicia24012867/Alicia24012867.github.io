import fs from 'node:fs';
import path from 'node:path';

/**
 * Audio files by extension, with the type a browser is asked about. When a piece comes in
 * several formats (the same name, other extensions), the browser tries them in this order.
 */
export const audioTypes = {
  '.opus': 'audio/ogg; codecs=opus',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.webm': 'audio/webm',
  '.weba': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
};
const preference = Object.keys(audioTypes);
// File names in the order Finder lists them: numbers by value, Chinese by pinyin.
const byName = new Intl.Collator('zh', { numeric: true });

/**
 * The music in `folder`, sorted by file name: one entry for each piece, with every format it
 * comes in. Other files, hidden ones and subfolders are left out, and so is a missing folder.
 * @param {string} folder
 * @param {string} [url] where the folder is served
 * @returns {{ name: string, sources: { src: string, type: string }[] }[]}
 */
export function findTracks(folder, url = '/audio/') {
  let entries;
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  const pieces = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const { name, ext } = path.parse(entry.name);
    const type = audioTypes[ext.toLowerCase()];
    if (!type || !name) continue;
    const files = pieces.get(name) ?? [];
    files.push({ file: entry.name, ext: ext.toLowerCase(), type });
    pieces.set(name, files);
  }
  return [...pieces]
    .sort(([a], [b]) => byName.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, files]) => ({
      name,
      sources: files
        .sort((a, b) => preference.indexOf(a.ext) - preference.indexOf(b.ext))
        .map(({ file, type }) => ({ src: url + encodeURIComponent(file), type })),
    }));
}

/**
 * `virtual:music` lists the pieces in `public/audio/`. The development server reloads the page
 * when one is added or removed, and each build lists what the folder holds then.
 */
export function musicPlugin() {
  const moduleId = 'virtual:music';
  const resolvedId = `\0${moduleId}`;
  let folder;
  let url;
  const owns = (file) => !!folder && path.dirname(path.resolve(file)) === folder;

  return {
    name: 'site-music',
    configResolved(config) {
      folder = config.publicDir ? path.join(config.publicDir, 'audio') : undefined;
      url = `${config.base}audio/`;
    },
    resolveId(id) {
      return id === moduleId ? resolvedId : null;
    },
    load(id) {
      if (id !== resolvedId) return null;
      const tracks = folder ? findTracks(folder, url) : [];
      return `const tracks = ${JSON.stringify(tracks)};\nexport default tracks;\n`;
    },
    configureServer(server) {
      if (!folder) return;
      server.watcher.add(folder);
      const refresh = (file) => {
        if (!owns(file)) return;
        const module = server.moduleGraph.getModuleById(resolvedId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh).on('unlink', refresh);
      server.httpServer?.once('close', () => {
        server.watcher.off('add', refresh).off('unlink', refresh);
      });
    },
  };
}
