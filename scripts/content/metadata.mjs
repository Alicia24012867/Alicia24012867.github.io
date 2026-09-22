import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { parse } from 'yaml';
import { resolveArticleSection } from '../../src/config/sections.mjs';

function articleDate(value, field, filename) {
  const date = value?.trim() || '';
  if (!date) return '';
  const day = date.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(
      date,
    ) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  ) {
    throw new Error(`${filename}: ${field} 请使用有效的 YYYY-MM-DD 日期或带时区的 ISO 时间戳`);
  }
  return date;
}

export function parseArticleSource(source, filename) {
  let metadata = {};
  let body = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (body.startsWith('---\n')) {
    const match = /^---\n([\s\S]*?)^---[ \t]*(?:\n|$)/m.exec(body);
    if (!match) throw new Error(`${filename}: front matter 缺少结束的 ---`);
    metadata = parse(match[1], { uniqueKeys: true }) ?? {};
    if (typeof metadata !== 'object' || Array.isArray(metadata))
      throw new Error(`${filename}: front matter 必须是对象`);
    body = body.slice(match[0].length);
  }
  if (metadata.draft != null && typeof metadata.draft !== 'boolean')
    throw new Error(`${filename}: draft 必须是布尔值 true 或 false，不要加引号`);
  if (metadata.draft === true) return null;
  for (const field of ['title', 'date', 'updated', 'description', 'author', 'email']) {
    if (metadata[field] != null && typeof metadata[field] !== 'string')
      throw new Error(`${filename}: ${field} 必须是字符串`);
  }
  if (
    metadata.tags != null &&
    (!Array.isArray(metadata.tags) || metadata.tags.some((tag) => typeof tag !== 'string'))
  ) {
    throw new Error(`${filename}: tags 应写成字符串列表，例如 [学习, 随记]`);
  }
  const date = articleDate(metadata.date, 'date', filename);
  const updated = articleDate(metadata.updated, 'updated', filename);
  return {
    body,
    metadata: {
      title: metadata.title?.trim() || '',
      description: metadata.description?.trim() || '',
      author: metadata.author?.trim() || undefined,
      email: metadata.email?.trim() || undefined,
      date,
      updated,
      tags: [...new Set((metadata.tags || []).map((tag) => tag.trim()).filter(Boolean))],
      section: resolveArticleSection(metadata.section, filename),
    },
  };
}

const git = (cwd, args) =>
  childProcess.execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 16 * 1024 * 1024,
  });

// Blog and Notes share one snapshot. Retain only the most recently used repository/revision.
let cachedHistory;
function articleHistory(root) {
  let repository;
  let revision;
  try {
    const identity = git(root, ['rev-parse', '--show-toplevel', '--verify', 'HEAD']).trimEnd();
    const separator = identity.lastIndexOf('\n');
    repository = identity.slice(0, separator);
    revision = identity.slice(separator + 1);
  } catch {
    return { repository: root, files: new Map() };
  }
  if (cachedHistory?.repository === repository && cachedHistory.revision === revision)
    return cachedHistory;

  const tokens = git(repository, [
    'log',
    '--first-parent',
    '--diff-merges=first-parent',
    '--reverse',
    '--find-renames',
    '--no-ext-diff',
    '--format=%x00@%aI',
    '--raw',
    '--no-abbrev',
    '-z',
    revision,
  ]).split('\0');
  const files = new Map();
  let timestamp;
  const removed = new Set();
  const changed = new Map();
  const applyCommit = () => {
    for (const file of removed) files.delete(file);
    for (const [file, dates] of changed) files.set(file, dates);
    removed.clear();
    changed.clear();
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index].trimStart();
    if (!token) continue;
    if (token.startsWith('@')) {
      applyCommit();
      timestamp = token.slice(1);
      continue;
    }
    const [, , before, after, status] = token.split(' ');
    const from = path.join(repository, tokens[++index]);
    const renamed = status.startsWith('R');
    const copied = status.startsWith('C');
    const to = renamed || copied ? path.join(repository, tokens[++index]) : from;
    if (renamed || status === 'D') removed.add(from);
    if (status === 'D') continue;
    const previous = status === 'A' || copied ? undefined : files.get(from);
    // Read all rename sources before applying the commit.
    changed.set(to, {
      date: previous?.date || timestamp,
      updated: previous ? (before === after ? previous.updated : timestamp) : '',
    });
  }
  applyCommit();
  cachedHistory = { repository, revision, files };
  return cachedHistory;
}

// Date-only metadata describes a calendar day, so an edit on that day is valid.
const beforePublication = (updated, date) =>
  date.length === 10 || updated.length === 10
    ? updated.slice(0, 10) < date.slice(0, 10)
    : Date.parse(updated) < Date.parse(date);

/** Resolve explicit metadata, then Git history, then a stable local preview date. */
export function createArticleDateResolver(root) {
  let history;
  return (article, file, absolute, compiled) => {
    let recorded;
    if (!article.date || !article.updated) {
      history ??= articleHistory(root);
      recorded = history.files.get(absolute);
    }
    const date =
      article.date ||
      recorded?.date ||
      (compiled.localDate ??= (() => {
        const stat = fs.statSync(absolute);
        const local = stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime;
        return [local.getFullYear(), local.getMonth() + 1, local.getDate()]
          .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
          .join('-');
      })());
    if (article.updated && beforePublication(article.updated, date))
      throw new Error(`${file}: updated 不可早于 date 发布时间`);
    const updated = article.updated || recorded?.updated || '';
    return { date, updated: updated && !beforePublication(updated, date) ? updated : '' };
  };
}
