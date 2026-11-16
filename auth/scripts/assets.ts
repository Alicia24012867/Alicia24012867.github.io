// Copies the site's fonts and icon into public/, so the sign-in pages look like nymphilia.com.
// The font files stay on nymphilia.com, which lets other origins use them; only the rules that
// name them are copied, with the addresses made absolute.
//
//   node scripts/assets.ts           write public/fonts.css and public/favicon.svg
//   node scripts/assets.ts --check   fail if either differs from what would be written (CI)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const site = 'https://nymphilia.com';
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const fontRules = readFileSync(here('../../web/src/styles/fonts.css'), 'utf8')
  .replace(/^\/\*.*?\*\/\n/s, '')
  .replaceAll("url('/fonts/", `url('${site}/fonts/`);
if (fontRules.includes("url('/")) throw new Error('fonts.css names a font this script misses');

const files = new Map([
  [
    '../public/fonts.css',
    `/* Copied from web/src/styles/fonts.css by \`npm run assets\`; do not edit. */\n${fontRules}`,
  ],
  ['../public/favicon.svg', readFileSync(here('../../web/public/favicon.svg'), 'utf8')],
]);

const check = process.argv.includes('--check');
let stale = 0;
for (const [path, text] of files) {
  const target = here(path);
  if (!check) {
    writeFileSync(target, text);
    continue;
  }
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {}
  if (current !== text) {
    console.error(`${path.slice(3)} is out of date; run \`npm run assets\`.`);
    stale += 1;
  }
}
if (stale) process.exit(1);
