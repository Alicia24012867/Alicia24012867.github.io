import path from 'node:path';
import { slugFromFile } from './text.mjs';

export function createReferenceResolver(filename, resolveAsset, onArticleLink) {
  return (value, image = false) => {
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(value)) return value;
    // Root-relative paths resolve from the User Pages site root.
    if (value.startsWith('/')) return `..${value}`;
    const match = /^([^?#]*)([?#].*)?$/.exec(value);
    if (!match || !match[1]) return value;
    let decoded;
    try {
      decoded = decodeURIComponent(match[1]).replaceAll('\\', '/');
    } catch {
      throw new Error(`${filename}: 无效的链接 ${value}`);
    }
    const localFile = path.posix.normalize(path.posix.join(path.posix.dirname(filename), decoded));
    if (localFile === '..' || localFile.startsWith('../') || path.posix.isAbsolute(localFile))
      throw new Error(`${filename}: 本地链接不可越过 articles 目录：${value}`);
    const suffix = match[2] || '';
    if (!image && /\.(md|html)$/i.test(localFile)) {
      const slug = slugFromFile(localFile);
      onArticleLink?.(slug, value);
      const anchor = suffix.includes('#') ? suffix.slice(suffix.indexOf('#')) : '';
      return `?post=${encodeURIComponent(slug)}${anchor}`;
    }
    return resolveAsset(localFile) + suffix;
  };
}
