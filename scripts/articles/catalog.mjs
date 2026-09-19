import fs from 'node:fs';
import path from 'node:path';
import { compileArticle } from '../articles.mjs';

/** Filesystem discovery and cross-file validation, independent of Vite. */
export function buildArticleCatalog(articleRoot, watch = () => {}) {
  const root = fs.realpathSync(articleRoot);
  const articles = [];
  const assets = new Map();
  const links = [];
  const slugs = new Set();

  function checkedFile(relative, owner) {
    const absolute = path.resolve(root, relative);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`${owner}: 找不到文章附件 ${relative}`);
    const real = fs.realpathSync(absolute);
    if (!real.startsWith(`${root}${path.sep}`)) throw new Error(`${owner}: 文件不可越过 articles 目录：${relative}`);
    watch(absolute);
    return absolute;
  }

  // Only files belong in Vite's module graph. The plugin watches the directory separately.
  const files = fs.readdirSync(root, { recursive: true }).map(entry => String(entry).replaceAll('\\', '/')).sort();
  for (const file of files) {
    if (!/\.(md|html)$/i.test(file) || /(^|\/)README\.md$/i.test(file) || file.split('/').some(part => part.startsWith('_') || part.startsWith('.'))) continue;
    if (!fs.statSync(path.join(root, file)).isFile()) continue;
    const absolute = checkedFile(file, file);
    const article = compileArticle(fs.readFileSync(absolute, 'utf8'), file, (asset) => {
      if (/\.(?:md|html|[cm]?js|ts|tsx|jsx)$/i.test(asset)) throw new Error(`${file}: 图片或附件不能引用文章源码或脚本：${asset}`);
      const assetPath = checkedFile(asset, file);
      if (!assets.has(assetPath)) assets.set(assetPath, `__ALICIA_ARTICLE_ASSET_${assets.size}__`);
      return assets.get(assetPath);
    }, (slug, link) => links.push({ owner: file, slug, link }));
    if (!article) continue;
    if (slugs.has(article.slug)) throw new Error(`文章地址重复：${article.slug}，请勿使用同名 .md 和 .html 文件`);
    slugs.add(article.slug);
    articles.push(article);
  }
  for (const { owner, slug, link } of links) {
    if (!slugs.has(slug)) throw new Error(`${owner}: 链接 ${link} 指向不存在或未发布的文章`);
  }
  articles.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  return { articles, assets };
}

export function catalogModule({ articles, assets }) {
  const imports = [...assets].map(([assetPath], index) => `import asset${index} from ${JSON.stringify(`${assetPath}?url`)};`).join('\n');
  const replacements = [...assets].map(([, marker], index) => `article.html = article.html.replaceAll(${JSON.stringify(marker)}, asset${index}.replaceAll('&', '&amp;').replaceAll('"', '&quot;'));`).join('\n');
  return `${imports}\nconst articles = ${JSON.stringify(articles)};\nfor (const article of articles) { ${replacements} }\nexport default articles;`;
}
