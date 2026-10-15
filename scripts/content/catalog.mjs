import fs from 'node:fs';
import path from 'node:path';
import { decodeHTML } from 'entities';
import { compileArticle } from './compile.mjs';
import { sizeImages } from './html.mjs';
import { readImageSize } from './images.mjs';
import { photoCopy } from './resize.mjs';
import { createArticleDateResolver } from './metadata.mjs';
import { blogSections, noteSections } from '../../src/config/sections.mjs';
import { decodeSlug } from '../../src/config/sharing.mjs';

/** Links written before static addresses existed still count as backlinks. */
function pathTarget(pathname, basePath) {
  if (!pathname.startsWith(basePath)) return undefined;
  const rest = pathname.slice(basePath.length).replace(/\/+$/, '');
  return rest ? decodeSlug(rest) : undefined;
}

function linkedSlugs(html, basePath) {
  const targets = new Set();
  const origin = 'https://content.invalid';
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)) {
    try {
      const url = new URL(decodeHTML(match[1]), origin + basePath);
      if (url.origin !== origin) continue;
      const target =
        url.pathname === basePath
          ? url.searchParams.get('post')
          : pathTarget(url.pathname, basePath);
      if (target) targets.add(target);
    } catch {
      // A malformed URL cannot contribute a backlink.
    }
  }
  return targets;
}

/** A site-root address such as /images/sky.webp names a file in Vite's public folder. */
function publicFile(publicDir, src) {
  if (!publicDir || !/^\/(?![/\\])/.test(src)) return undefined;
  let pathname;
  try {
    pathname = decodeURIComponent(src.replace(/[?#][\s\S]*$/, ''));
  } catch {
    return undefined;
  }
  const file = path.join(publicDir, pathname);
  return file.startsWith(`${publicDir}${path.sep}`) ? file : undefined;
}

/** Filesystem discovery and cross-file validation, independent of Vite. */
export function buildArticleCatalog(
  articleRoot,
  watch = () => {},
  { basePath = '/blog/', cache = new Map(), changedFiles, publicDir, copyDirectory } = {},
) {
  let root;
  try {
    root = fs.realpathSync.native(articleRoot);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Git does not retain empty folders; a collection can have no authored files yet.
    cache.clear();
    return { articles: [], assets: new Map(), copies: new Map() };
  }
  const sections = basePath === '/notes/' ? noteSections : blogSections;
  const resolveDates = createArticleDateResolver(root);
  const articles = [];
  const assets = new Map();
  const links = [];
  const slugs = new Set();
  const visited = new Set();
  const outgoing = new Map();
  const checked = new Map();
  const assetFiles = new Map();
  const copies = new Map();

  function checkedFile(relative, owner, isFile = false) {
    const absolute = path.resolve(root, relative);
    if (checked.has(absolute)) return absolute;
    const stat = isFile ? undefined : fs.statSync(absolute, { throwIfNoEntry: false });
    if (!isFile && !stat?.isFile()) throw new Error(`${owner}: 找不到文章附件 ${relative}`);
    const real = fs.realpathSync.native(absolute);
    if (!real.startsWith(`${root}${path.sep}`))
      throw new Error(`${owner}: 文件不可越过 articles 目录：${relative}`);
    watch(absolute);
    checked.set(absolute, stat);
    return absolute;
  }

  // Attachments and public images get their real size; remote and missing images do not.
  const sizeOf = (src) => {
    const asset = assetFiles.get(/^__ALICIA_ARTICLE_ASSET_\d+__/.exec(src)?.[0]);
    if (asset) return readImageSize(asset, checked.get(asset));
    const file = publicFile(publicDir, src);
    if (!file) return undefined;
    // Replacing or adding the public file refreshes the article as an attachment would.
    watch(file);
    return readImageSize(file);
  };

  // A large attachment shows a smaller copy, which the plugin makes when it is first shown.
  const copyOf =
    copyDirectory &&
    ((src, size, place) => {
      const asset = assetFiles.get(/^__ALICIA_ARTICLE_ASSET_\d+__$/.exec(src)?.[0]);
      const copy = asset && photoCopy(asset, size, place, copyDirectory);
      if (!copy) return undefined;
      if (!assets.has(copy.file)) assets.set(copy.file, `__ALICIA_ARTICLE_ASSET_${assets.size}__`);
      copies.set(copy.file, copy);
      return { src: assets.get(copy.file), width: copy.width };
    });

  // Only files belong in Vite's module graph. The plugin watches the directory separately.
  const files = new Map();
  function discover(directory = '') {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const file = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) discover(file);
      else if (/\.(md|html)$/i.test(entry.name) && !/^README\.md$/i.test(entry.name)) {
        // Match regular files and file symlinks, without following directory symlinks.
        if (
          entry.isFile() ||
          (entry.isSymbolicLink() && fs.statSync(path.join(root, file)).isFile())
        )
          files.set(file, entry.isFile());
      }
    }
  }
  discover();
  for (const file of [...files.keys()].sort()) {
    const absolute = checkedFile(file, file, files.get(file));
    visited.add(absolute);
    let compiled = cache.get(absolute);
    // Only a complete watcher change set permits skipping reads; standalone builds reread.
    const source =
      compiled && changedFiles && !changedFiles.has(file)
        ? compiled.source
        : fs.readFileSync(absolute, 'utf8');
    if (!compiled || compiled.source !== source || compiled.basePath !== basePath) {
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
        { basePath },
      );
      compiled = {
        source,
        basePath,
        article,
        localAssets,
        localLinks,
        localDate: compiled?.localDate,
      };
      cache.set(absolute, compiled);
    }
    // Revalidate assets and targets even when the unchanged source reuses compiled HTML.
    const replacements = new Map();
    for (const [asset, marker] of compiled.localAssets) {
      const assetPath = checkedFile(asset, file);
      if (!assets.has(assetPath)) assets.set(assetPath, `__ALICIA_ARTICLE_ASSET_${assets.size}__`);
      replacements.set(marker, assets.get(assetPath));
      assetFiles.set(assets.get(assetPath), assetPath);
    }
    links.push(...compiled.localLinks);
    // Image sizes are checked on every build, so a replaced image never keeps an old size.
    const article = compiled.article && {
      ...compiled.article,
      section: sections.resolve(compiled.article.section, file),
      html: sizeImages(
        replacements.size
          ? compiled.article.html.replace(
              /__ALICIA_ARTICLE_ASSET_\d+__/g,
              (marker) => replacements.get(marker) ?? marker,
            )
          : compiled.article.html,
        sizeOf,
        copyOf,
      ),
    };
    if (!article) continue;
    Object.assign(article, resolveDates(article, file, absolute, compiled));
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
  articles.sort(
    (a, b) =>
      b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)) || a.slug.localeCompare(b.slug),
  );
  // Rebuild incoming edges from cached targets, including explicit ?post links.
  const incoming = new Map(articles.map((article) => [article.slug, new Set()]));
  for (const article of articles) {
    for (const target of outgoing.get(article.slug))
      if (target !== article.slug) incoming.get(target)?.add(article.slug);
  }
  for (const article of articles) article.backlinks = [...incoming.get(article.slug)];
  return { articles, assets, copies };
}
