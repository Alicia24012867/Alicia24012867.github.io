import path from 'node:path';
import { sharePath } from '../../src/config/sharing.mjs';
import { slugFromFile } from './text.mjs';

/** Other pages can read the static address; the parser keeps ?post= links working. */
function queryTarget(value) {
  const [search, hash = ''] = value.slice(1).split('#');
  const params = new URLSearchParams(search);
  const target = params.get('post');
  return target ? { target, params, hash } : undefined;
}

export function createReferenceResolver(
  filename,
  resolveAsset,
  onArticleLink,
  basePath = '/blog/',
) {
  return (value, image = false) => {
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return value;
    if (value.startsWith('?')) {
      const link = queryTarget(value);
      if (!link) return value;
      onArticleLink?.(link.target, value);
      link.params.delete('post');
      const rest = link.params.toString();
      return (
        sharePath(basePath, link.target) +
        (rest ? '?' + rest : '') +
        (link.hash ? '#' + link.hash : '')
      );
    }
    // Root-relative paths already resolve from the site root at any page depth.
    if (value.startsWith('/')) return value;
    const match = /^([^?#]*)([?#].*)?$/.exec(value);
    if (!match || !match[1]) return value;
    let decoded;
    try {
      decoded = decodeURIComponent(match[1]).replaceAll('\\', '/');
    } catch {
      throw new Error(filename + ': 无效的链接 ' + value);
    }
    const localFile = path.posix.normalize(path.posix.join(path.posix.dirname(filename), decoded));
    if (localFile === '..' || localFile.startsWith('../') || path.posix.isAbsolute(localFile))
      throw new Error(filename + ': 本地链接不可越过 articles 目录：' + value);
    const suffix = match[2] || '';
    if (!image && /\.(md|html)$/i.test(localFile)) {
      const slug = slugFromFile(localFile);
      onArticleLink?.(slug, value);
      const anchor = suffix.includes('#') ? suffix.slice(suffix.indexOf('#')) : '';
      return sharePath(basePath, slug) + anchor;
    }
    return resolveAsset(localFile) + suffix;
  };
}
