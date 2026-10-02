#!/usr/bin/env node
/**
 * Render one share card per published article from the blue-sky key visual.
 *
 *   node scripts/share/cards.mjs           # render every card under public/images/share
 *   node scripts/share/cards.mjs --check   # only report missing or outdated cards
 *
 * Cards are committed so builds, tests and CI never need Pillow or a CJK font.
 * The file name carries a digest of the card text, so a renamed or reworded
 * article is reported instead of silently sharing an old picture.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildArticleCatalog } from '../content/catalog.mjs';
import {
  articleCard,
  cardCollections,
  CARD_FORMAT,
  SHARE_DIRECTORY,
  siteCard,
  SKY_IMAGE,
  skyDigest,
} from './spec.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const publicRoot = path.join(root, 'public');
const renderer = path.join(import.meta.dirname, 'render_card.py');
const check = process.argv.includes('--check');
const imageFile = /\.(?:png|jpe?g|webp)$/i;

function collectCards() {
  const sky = skyDigest(publicRoot);
  const cards = [];
  for (const collection of cardCollections) {
    const catalog = buildArticleCatalog(path.join(root, collection.directory), () => {}, {
      basePath: collection.basePath,
    });
    for (const article of catalog.articles)
      cards.push({
        article,
        collection,
        ...articleCard(article, collection.basePath, { publicRoot, sky }),
      });
  }
  return { cards, site: siteCard({ publicRoot, sky }) };
}

function readTree(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? readTree(file) : [file];
  });
}

/** Remove rendered cards that no published article points at any more. */
function pruneStale(keep) {
  const shareRoot = path.join(publicRoot, SHARE_DIRECTORY);
  const files = readTree(shareRoot);
  const removed = files.filter((file) => imageFile.test(file) && !keep.has(file));
  for (const file of removed) fs.rmSync(file);
  const directories = files
    .map((file) => path.dirname(file))
    .filter((directory, index, all) => all.indexOf(directory) === index)
    .sort((a, b) => b.length - a.length);
  for (const directory of directories)
    if (fs.existsSync(directory) && !fs.readdirSync(directory).length) fs.rmdirSync(directory);
  return removed;
}

const { cards, site } = collectCards();
const missing = [...cards, site].filter((card) => !fs.existsSync(card.file));

if (check) {
  if (missing.length) {
    console.error('分享图缺失或已过期，请运行 npm run share:cards：');
    for (const card of missing) console.error('  - ' + card.relative);
    process.exit(1);
  }
  console.log('分享图齐全：' + cards.length + ' 篇文章 + 首页');
  process.exit(0);
}

const python = process.env.SHARE_PYTHON || 'python3';
const probe = spawnSync(python, ['-c', 'import PIL; print(PIL.__version__)'], { encoding: 'utf8' });
if (probe.status !== 0)
  throw new Error(
    '分享图生成需要 Python 3 与 Pillow（' +
      python +
      ' -m pip install Pillow），也可以用 SHARE_PYTHON 指定解释器',
  );

const request = {
  background: path.join(publicRoot, SKY_IMAGE),
  format: CARD_FORMAT,
  jobs: [...cards, site].map((card) => ({ output: card.file, ...card.spec })),
};
const render = spawnSync(python, [renderer], {
  input: JSON.stringify(request),
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
if (render.status !== 0) {
  process.stderr.write(render.stderr || '');
  throw new Error('分享图渲染失败，请检查上面的 Python 错误信息');
}
const rendered = new Map(JSON.parse(render.stdout).cards.map((card) => [card.output, card.bytes]));
const keep = new Set(request.jobs.map((job) => job.output));
const removed = pruneStale(keep);
console.log('Pillow ' + probe.stdout.trim() + ' · ' + cards.length + ' 篇文章 + 首页');
for (const card of [...cards, site]) {
  const label = card.article ? card.article.title : 'Homepage card';
  console.log(
    '  ' + card.relative + '  ' + Math.round(rendered.get(card.file) / 1024) + ' KB  · ' + label,
  );
}
for (const file of removed) console.log('  已删除过期分享图 ' + path.relative(publicRoot, file));
