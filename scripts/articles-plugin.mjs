import fs from 'node:fs';
import path from 'node:path';
import { compileArticle } from './articles.mjs';

const moduleId = 'virtual:articles';
const resolvedId = `\0${moduleId}`;

export function articlesPlugin() {
  let articleRoot;
  return {
    name: 'local-articles',
    configResolved(config) { articleRoot = path.resolve(config.root, 'articles'); },
    resolveId(id) { return id === moduleId ? resolvedId : null; },
    load(id) {
      if (id !== resolvedId) return null;
      this.addWatchFile(articleRoot);
      const assets = new Map();
      const articles = [];
      const slugs = new Set();
      const files = fs.readdirSync(articleRoot, { recursive: true }).map(entry => String(entry).replaceAll('\\', '/')).sort();
      for (const file of files) {
        if (!/\.(md|html)$/i.test(file) || /(^|\/)README\.md$/i.test(file) || file.split('/').some(part => part.startsWith('_') || part.startsWith('.'))) continue;
        const absolute = path.join(articleRoot, file);
        if (!fs.statSync(absolute).isFile()) continue;
        this.addWatchFile(absolute);
        const article = compileArticle(fs.readFileSync(absolute, 'utf8'), file, (asset) => {
          const assetPath = path.join(articleRoot, asset);
          if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) throw new Error(`${file}: 找不到文章附件 ${asset}`);
          if (/\.(?:md|html|js|mjs|ts|tsx|jsx)$/i.test(asset)) throw new Error(`${file}: 图片或附件不能引用文章源码或脚本：${asset}`);
          if (!assets.has(assetPath)) assets.set(assetPath, `__ALICIA_ARTICLE_ASSET_${assets.size}__`);
          this.addWatchFile(assetPath);
          return assets.get(assetPath);
        });
        if (!article) continue;
        if (slugs.has(article.slug)) throw new Error(`文章地址重复：${article.slug}，请勿使用同名 .md 和 .html 文件`);
        slugs.add(article.slug);
        articles.push(article);
      }
      articles.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
      const imports = [...assets].map(([assetPath], i) => `import asset${i} from ${JSON.stringify(`${assetPath}?url`)};`).join('\n');
      const replacements = [...assets].map(([, marker], i) => `article.html = article.html.replaceAll(${JSON.stringify(marker)}, asset${i}.replaceAll('&', '&amp;').replaceAll('"', '&quot;'));`).join('\n');
      return `${imports}\nconst articles = ${JSON.stringify(articles)};\nfor (const article of articles) { ${replacements} }\nexport default articles;`;
    },
    configureServer(server) {
      server.watcher.add(articleRoot);
      const reload = (file) => {
        if (!path.resolve(file).startsWith(`${articleRoot}${path.sep}`)) return;
        const module = server.moduleGraph.getModuleById(resolvedId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', reload).on('change', reload).on('unlink', reload);
      server.httpServer?.once('close', () => {
        server.watcher.off('add', reload).off('change', reload).off('unlink', reload);
      });
    },
  };
}
