// Copies the site's fonts from Google Fonts into public/fonts/ and writes the matching
// src/styles/fonts.css, so pages load them from the site itself. The files are the ones
// Google serves to current browsers, sliced by character range, so each page downloads
// only the slices its text uses. Run `npm run fonts:fetch` after changing `families`.
//
// Google's Noto Sans SC sets the curly quotes ‘ ’ “ ” full width, as Chinese text wants, and
// leaves out their Latin-width forms, so English showed a gap after each. The last face adds
// those forms, made by scripts/proportional_quotes.py from Noto Sans JP (the same typeface),
// which needs Python 3 with fontTools and brotli; global.css uses them outside Chinese text.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as prettier from 'prettier';

const root = path.resolve(import.meta.dirname, '..');
const families = ['Noto Sans SC:wght@400..700', 'Playfair Display:ital,wght@1,400..600'];
const request =
  'https://fonts.googleapis.com/css2?' +
  families.map((family) => 'family=' + family.replaceAll(' ', '+')).join('&') +
  '&display=swap';
const quotes = '‘’“”';
const latinQuotes =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400..700&text=' +
  encodeURIComponent(quotes);
const python = process.env.FONTS_PYTHON || 'python3';
// Google picks the file format by browser; this asks for WOFF2 with character slices.
const userAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const fontsDir = path.join(root, 'public/fonts');
const stylesheet = path.join(root, 'src/styles/fonts.css');

const fetchOk = async (url) => {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
};

const css = await (await fetchOk(request)).text();
const faces = [...css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g)].map(
  ([, label, body]) => {
    const value = (name) => body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
    const family = value('font-family').replaceAll("'", '');
    const style = value('font-style');
    const source = body.match(/url\(([^)]+)\)/)?.[1];
    // Character slices are numbered in the file name; script subsets are named in a comment.
    const slice = label ?? source?.match(/\.(\d+)\.woff2$/)?.[1];
    if (!source || !slice) throw new Error(`Unexpected font face in Google's stylesheet:\n${body}`);
    const folder =
      family.toLowerCase().replaceAll(' ', '-') + (style === 'italic' ? '-italic' : '');
    return {
      family,
      style,
      weight: value('font-weight'),
      range: value('unicode-range'),
      source,
      file: `${folder}/${slice}.woff2`,
    };
  },
);
const chinese = faces.find(
  (face) => face.family === 'Noto Sans SC' && face.file.endsWith('/latin.woff2'),
);
// Defined last, so browsers take the four quotes from it rather than from the slices.
const quoteFace = {
  ...chinese,
  range: 'U+2018-2019, U+201c-201d',
  file: 'noto-sans-sc/quotes.woff2',
};
if (new Set([...faces, quoteFace].map((face) => face.file)).size !== faces.length + 1)
  throw new Error('Two font faces would share one file name');

fs.rmSync(fontsDir, { recursive: true, force: true });
let bytes = 0;
for (const face of faces) {
  const data = Buffer.from(await (await fetchOk(face.source)).arrayBuffer());
  fs.mkdirSync(path.dirname(path.join(fontsDir, face.file)), { recursive: true });
  fs.writeFileSync(path.join(fontsDir, face.file), data);
  bytes += data.length;
}

const latinCss = await (await fetchOk(latinQuotes)).text();
const latinSource = latinCss.match(/url\(([^)]+)\)/)?.[1];
if (!latinSource) throw new Error(`Unexpected stylesheet for the Latin quotes:\n${latinCss}`);
const latinFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fonts-')), 'quotes.woff2');
fs.writeFileSync(latinFile, Buffer.from(await (await fetchOk(latinSource)).arrayBuffer()));
const build = spawnSync(
  python,
  [
    path.join(import.meta.dirname, 'proportional_quotes.py'),
    path.join(fontsDir, chinese.file),
    latinFile,
    path.join(fontsDir, quoteFace.file),
  ],
  { encoding: 'utf8' },
);
fs.rmSync(path.dirname(latinFile), { recursive: true, force: true });
if (build.status !== 0) {
  process.stderr.write(build.stderr || build.error?.message || '');
  throw new Error(
    `Building the quotes needs Python 3 with fontTools and brotli (${python} -m pip install ` +
      'fonttools brotli); FONTS_PYTHON can name another interpreter',
  );
}
bytes += fs.statSync(path.join(fontsDir, quoteFace.file)).size;

const rules = [...faces, quoteFace].map(
  (
    face,
  ) => `${face === quoteFace ? '/* The quotes with their Latin-width forms; see scripts/fonts.mjs. */\n' : ''}@font-face {
  font-family: '${face.family}';
  font-style: ${face.style};
  font-weight: ${face.weight};
  font-display: swap;
  src: url('/fonts/${face.file}') format('woff2');
  unicode-range: ${face.range};
}`,
);
const header = `/* Generated by \`npm run fonts:fetch\` (scripts/fonts.mjs) from Google Fonts; do not edit. */`;
const output = await prettier.format(`${header}\n${rules.join('\n')}\n`, {
  ...(await prettier.resolveConfig(stylesheet)),
  filepath: stylesheet,
});
fs.writeFileSync(stylesheet, output);
console.log(
  `${faces.length + 1} font files (${(bytes / 1024 / 1024).toFixed(2)} MB) in public/fonts/`,
);
