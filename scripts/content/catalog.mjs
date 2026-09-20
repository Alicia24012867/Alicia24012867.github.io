import fs from 'node:fs';
import path from 'node:path';
import { decodeHTML } from 'entities';
import { compileArticle } from './compile.mjs';

function linkedSlugs(html, basePath) {
  const targets = new Set();
  const origin = 'https://content.invalid';
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)) {
    try {
      const url = new URL(decodeHTML(match[1]), origin + basePath);
      const target = url.searchParams.get('post');
      if (target && url.origin === origin && url.pathname === basePath) targets.add(target);
    } catch {
      // A malformed URL cannot contribute a backlink.
    }
  }
  return targets;
}

/** Filesystem discovery and cross-file validation, independent of Vite. */
export function buildArticleCatalog(
  articleRoot,
  watch = () => {},
  { basePath = '/blog/', cache = new Map(), changedFiles } = {},
) {
  const root = fs.realpathSync(articleRoot);
  const articles = [];
  const assets = new Map();
  const links = [];
  const slugs = new Set();
  const visited = new Set();
  const outgoing = new Map();

  function checkedFile(relative, owner) {
    const absolute = path.resolve(root, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile())
      throw new Error(`${owner}: 找不到文章附件 ${relative}`);
    const real = fs.realpathSync(absolute);
    if (!real.startsWith(`${root}${path.sep}`))
      throw new Error(`${owner}: 文件不可越过 articles 目录：${relative}`);
    watch(absolute);
    return absolute;
  }

  // Only files belong in Vite's module graph. The plugin watches the directory separately.
  const files = fs
    .readdirSync(root, { recursive: true })
    .map((entry) => String(entry).replaceAll('\\', '/'))
    .sort();
  for (const file of files) {
    if (
      !/\.(md|html)$/i.test(file) ||
      /(^|\/)README\.md$/i.test(file) ||
      file.split('/').some((part) => part.startsWith('_') || part.startsWith('.'))
    )
      continue;
    if (!fs.statSync(path.join(root, file)).isFile()) continue;
    const absolute = checkedFile(file, file);
    visited.add(absolute);
    let compiled = cache.get(absolute);
    // Only a complete watcher change set permits skipping reads; standalone builds reread.
    const source =
      compiled && changedFiles && !changedFiles.has(file)
        ? compiled.source
        : fs.readFileSync(absolute, 'utf8');
    if (!compiled || compiled.source !== source) {
      const localAssets = new Map();
      const localLinks = [];
      const article = compileArticle(
        source,
        file,
        (asset) => {
          if (/\.(?:md|html|[cm]?js|ts|tsx|jsx)$/i.test(asset))
            throw new Error(`${file}: 图片或附件不能引用文章源码或脚本：${asset}`);
          if (!localAssets.has(asset))
            localAssets.set(asset, `__ALICIA_ARTICLE_ASSET_${localAssets.size}__`);
          return localAssets.get(asset);
        },
        (slug, link) => localLinks.push({ owner: file, slug, link }),
      );
      compiled = { source, article, localAssets, localLinks };
      cache.set(absolute, compiled);
    }
    // Revalidate assets and targets even when the unchanged source reuses compiled HTML.
    const replacements = new Map();
    for (const [asset, marker] of compiled.localAssets) {
      const assetPath = checkedFile(asset, file);
      if (!assets.has(assetPath)) assets.set(assetPath, `__ALICIA_ARTICLE_ASSET_${assets.size}__`);
      replacements.set(marker, assets.get(assetPath));
    }
    links.push(...compiled.localLinks);
    const article = compiled.article && {
      ...compiled.article,
      html: replacements.size
        ? compiled.article.html.replace(
            /__ALICIA_ARTICLE_ASSET_\d+__/g,
            (marker) => replacements.get(marker) ?? marker,
          )
        : compiled.article.html,
    };
    if (!article) continue;
    if (slugs.has(article.slug))
      throw new Error(`文章地址重复：${article.slug}，请勿使用同名 .md 和 .html 文件`);
    slugs.add(article.slug);
    articles.push(article);
    if (compiled.references?.basePath !== basePath)
      compiled.references = { basePath, targets: linkedSlugs(compiled.article.html, basePath) };
    outgoing.set(article.slug, compiled.references.targets);
  }
  for (const file of cache.keys()) if (!visited.has(file)) cache.delete(file);
  for (const { owner, slug, link } of links) {
    if (!slugs.has(slug)) throw new Error(`${owner}: 链接 ${link} 指向不存在或未发布的文章`);
  }
  articles.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  // Rebuild incoming edges from cached targets, including explicit ?post links.
  const incoming = new Map(articles.map((article) => [article.slug, new Set()]));
  for (const article of articles) {
    for (const target of outgoing.get(article.slug))
      if (target !== article.slug) incoming.get(target)?.add(article.slug);
  }
  for (const article of articles) article.backlinks = [...incoming.get(article.slug)];
  return { articles, assets };
}
