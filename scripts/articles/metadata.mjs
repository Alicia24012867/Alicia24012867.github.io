import { parse } from 'yaml';
import { resolveArticleSection } from '../sections.mjs';

export function parseArticleSource(source, filename) {
  let metadata = {};
  let body = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (body.startsWith('---\n')) {
    const match = /^---\n([\s\S]*?)^---[ \t]*(?:\n|$)/m.exec(body);
    if (!match) throw new Error(`${filename}: front matter 缺少结束的 ---`);
    metadata = parse(match[1], { uniqueKeys: true }) ?? {};
    if (typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error(`${filename}: front matter 必须是对象`);
    body = body.slice(match[0].length);
  }
  if (metadata.draft != null && typeof metadata.draft !== 'boolean') throw new Error(`${filename}: draft 必须是布尔值 true 或 false，不要加引号`);
  if (metadata.draft === true) return null;
  for (const field of ['title', 'date', 'description']) {
    if (metadata[field] != null && typeof metadata[field] !== 'string') throw new Error(`${filename}: ${field} 必须是字符串`);
  }
  if (metadata.tags != null && (!Array.isArray(metadata.tags) || metadata.tags.some(tag => typeof tag !== 'string'))) {
    throw new Error(`${filename}: tags 应写成字符串列表，例如 [学习, 随记]`);
  }
  const date = metadata.date?.trim() || '';
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
    throw new Error(`${filename}: date 请使用有效的 YYYY-MM-DD 日期`);
  }
  return {
    body,
    metadata: {
      title: metadata.title?.trim() || '',
      description: metadata.description?.trim() || '',
      date,
      tags: [...new Set((metadata.tags || []).map(tag => tag.trim()).filter(Boolean))],
      section: resolveArticleSection(metadata.section, filename),
    },
  };
}
