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

/** The folder's real path, or undefined while it does not exist. */
function realFolder(directory) {
  try {
    return fs.realpathSync.native(directory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  }
}

/** What a public build log says of an error in a locked document: that there is one. */
const hiddenError = () =>
  new Error(
    '加密文章有误：构建日志是公开的，这里不显示是哪一篇、错在哪里。请在本地运行 npm run build 查看',
  );

/**
 * Filesystem discovery and cross-file validation, independent of Vite. `lockedRoot` holds the
 * collection's locked documents, from a private repository: they join the collection under
 * their own addresses, and the content plugin seals them before they ship. `levels` names their
 * levels, lowest first; a locked document picks one with `access`, or is of the lowest. Where
 * `publicLog`, as in CI, anyone can read the build log, so an error in a locked document never
 * says which one it is or quotes it: a local build shows the error itself.
 */
export function buildArticleCatalog(
  articleRoot,
  watch = () => {},
  {
    basePath = '/blog/',
    cache = new Map(),
    changedFiles,
    publicDir,
    copyDirectory,
    lockedRoot,
    levels = [],
    publicLog = false,
  } = {},
) {
  // Git does not retain empty folders; a collection can have no authored files yet.
  const roots = [
    { root: realFolder(articleRoot), locked: false },
    { root: lockedRoot && realFolder(lockedRoot), locked: true },
  ].filter(({ root }) => root);
  if (!roots.length) {
    cache.clear();
    return { articles: [], assets: new Map(), copies: new Map() };
  }
  const sections = basePath === '/notes/' ? noteSections : blogSections;
  const dateResolvers = new Map(roots.map(({ root }) => [root, createArticleDateResolver(root)]));
  const articles = [];
  const assets = new Map();
  const links = [];
  const slugs = new Set();
  const visited = new Set();
  const outgoing = new Map();
  const checked = new Map();
  const assetFiles = new Map();
  const copies = new Map();
  // An error while reading a locked document, as the build log may show it.
  const shown = (locked, error) => (locked && publicLog ? hiddenError() : error);
  const reading = (locked, read) => {
    try {
      return read();
    } catch (error) {
      throw shown(locked, error);
    }
  };

  function checkedFile(relative, owner, root, isFile = false) {
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
  function discover(root, directory = '', files = new Map()) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const file = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) discover(root, file, files);
      else if (/\.(md|html)$/i.test(entry.name) && !/^README\.md$/i.test(entry.name)) {
        // Match regular files and file symlinks, without following directory symlinks.
        if (
          entry.isFile() ||
          (entry.isSymbolicLink() && fs.statSync(path.join(root, file)).isFile())
        )
          files.set(file, entry.isFile());
      }
    }
    return files;
  }
  // Public documents first, so a collection without locked ones numbers its files as before.
  const sources = roots.flatMap(({ root, locked }) => {
    const files = reading(locked, () => discover(root));
    return [...files.keys()]
      .sort()
      .map((file) => ({ root, locked, file, isFile: files.get(file) }));
  });
  const lockedSlugs = new Set();
  function addDocument({ root, locked, file, isFile }) {
    // Errors name the folder a locked file sits in, since its path matches a public one.
    const owner = locked ? `加密文章 ${file}` : file;
    const absolute = checkedFile(file, owner, root, isFile);
    visited.add(absolute);
    let compiled = cache.get(absolute);
    // Watchers report paths from the public folder, locked ones included.
    const changeKey = locked
      ? path.relative(articleRoot, path.join(lockedRoot, file)).replaceAll('\\', '/')
      : file;
    // Only a complete watcher change set permits skipping reads; standalone builds reread.
    const source =
      compiled && changedFiles && !changedFiles.has(changeKey)
        ? compiled.source
        : fs.readFileSync(absolute, 'utf8');
    if (!compiled || compiled.source !== source || compiled.basePath !== basePath) {
      const localAssets = new Map();
      const localLinks = [];
      let article;
      try {
        article = compileArticle(
          source,
          file,
          (asset) => {
            if (/\.(?:md|html|[cm]?js|ts|tsx|jsx)$/i.test(asset))
              throw new Error(`${file}: 图片或附件不能引用文章源码或脚本：${asset}`);
            if (!localAssets.has(asset))
              localAssets.set(asset, `__ALICIA_ARTICLE_ASSET_${localAssets.size}__`);
            return localAssets.get(asset);
          },
          (slug, link) => localLinks.push({ owner, slug, link, locked }),
          { basePath },
        );
      } catch (error) {
        if (locked) error.message = `加密文章 ${error.message}`;
        throw error;
      }
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
      const assetPath = checkedFile(asset, owner, root);
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
    if (!article) return;
    // A public file is readable in the public repository whatever it says, and a locked one is
    // always sealed: either flag in the wrong folder would promise something false.
    if (!locked && article.locked)
      throw new Error(
        `${file}: 公开目录里的文章任何人都能读到，不会加密；要加密，请把它移到加密文章目录 content/locked/`,
      );
    if (locked && article.locked === false)
      throw new Error(
        `${owner}: 加密文章目录里的文章总会加密；要公开发布，请把它移到公开目录，并去掉 locked`,
      );
    if (!locked && article.unlisted)
      throw new Error(`${file}: unlisted 只能用于加密文章，公开文章总会出现在列表里`);
    if (!locked && article.access)
      throw new Error(`${file}: access 只能用于加密文章，公开文章任何人都能读到`);
    const level = article.access ? levels.indexOf(article.access) : 0;
    // Build logs are public, so they name the file to check rather than any level.
    if (level < 0)
      throw new Error(`${owner}: access 写的等级不在 content/locked/access.yml 里，请检查拼写`);
    delete article.locked;
    delete article.access;
    if (locked) {
      article.locked = true;
      article.level = level;
      lockedSlugs.add(article.slug);
    }
    Object.assign(article, dateResolvers.get(root)(article, owner, absolute, compiled));
    if (slugs.has(article.slug))
      throw new Error(
        locked || lockedSlugs.has(article.slug)
          ? `文章地址重复：${article.slug}，加密文章不能与公开文章同名`
          : `文章地址重复：${article.slug}，请勿使用同名 .md 和 .html 文件`,
      );
    slugs.add(article.slug);
    articles.push(article);
    if (compiled.references?.basePath !== basePath)
      compiled.references = { basePath, targets: linkedSlugs(compiled.article.html, basePath) };
    outgoing.set(article.slug, compiled.references.targets);
  }
  for (const source of sources) reading(source.locked, () => addDocument(source));
  for (const file of cache.keys()) if (!visited.has(file)) cache.delete(file);
  for (const { owner, slug, link, locked } of links) {
    if (!slugs.has(slug))
      throw shown(locked, new Error(`${owner}: 链接 ${link} 指向不存在或未发布的文章`));
    // Builds without the private repository must still find every target of a public file.
    if (!locked && lockedSlugs.has(slug))
      throw new Error(
        `${owner}: 公开文章不能用文件链接 ${link} 指向加密文章，请改用它的网址，例如 ${basePath}<地址>/`,
      );
  }
  articles.sort(
    (a, b) =>
      b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)) || a.slug.localeCompare(b.slug),
  );
  // Rebuild incoming edges from cached targets, including explicit ?post links.
  const incoming = new Map(articles.map((article) => [article.slug, new Set()]));
  // A document names only the documents linking to it that its own readers can open: a public
  // one names public ones, and a locked one those of its level and below.
  const reach = new Map(articles.map((article) => [article.slug, article.level ?? -1]));
  for (const article of articles) {
    for (const target of outgoing.get(article.slug))
      if (target !== article.slug && reach.get(article.slug) <= (reach.get(target) ?? -1))
        incoming.get(target)?.add(article.slug);
  }
  for (const article of articles) article.backlinks = [...incoming.get(article.slug)];
  return { articles, assets, copies };
}
