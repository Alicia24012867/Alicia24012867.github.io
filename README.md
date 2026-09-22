# Alicia

React、TypeScript、Vite 多页面个人网站：主页 `/`、Blog `/blog/`、知识库 `/notes/`。文本使用 UTF-8。

## 开发与检查

需要 Node.js 22.12+ 和 npm，CI 使用 Node.js 24。

```sh
npm ci
npm run dev
npm run check         # 测试、类型检查、生产构建
npm run format       # 格式化代码
npm run format:check # 检查格式
npm run preview      # 预览 dist/
```

## 目录

```text
src/
  home/              首页入口、区块与交互
  blog/              Blog 入口、列表、阅读页与目录索引
  notes/             Notes 入口、列表、阅读页与全文搜索
  not-found.tsx      独立 404 入口，复用首页主图与全站导航
  components/        全站布局、导航、图标与主题切换
  config/            个人资料、Blog 分区、Notes 主题
  content/           共享内容路由、标签、搜索索引、类型与 URL 工具
    reader/          正文、目录、代码复制与图表渲染
  hooks/             搜索状态与页面元信息
  styles/            全局、内容页与 404 样式
content/
  blog/              文章和附件
  notes/             笔记和附件
scripts/
  content/           内容编译、校验和 Vite 插件
  verify-build.mjs   构建依赖检查与包体积报告
  benchmark-*.mjs    内容编译与搜索性能基准
tests/              编译、索引与插件测试
docs/               撰写说明
```

## 内容与配置

- 个人资料：`src/config/profile.ts`；研究方向：`src/config/interests.ts`。
- Blog 分区：`src/config/sections.mjs`；Notes 主题：`src/config/noteTopics.ts`。
- 新文章放入 `content/blog/`，新笔记放入 `content/notes/`，支持 `.md` 和 `.html`。
- 文件路径决定地址：`content/blog/test.md` → `/blog/?post=test`。目录迁移不改变现有线上地址。
- `draft: true` 排除发布；本地附件和文章互链在构建时校验。
- Blog 和所有 Notes 分类统一显示 `Posted on`，有后续编辑时显示 `Edited on`；日期自动读取 Git 历史，也可通过 `date` / `updated` 指定。
- 列表仅加载摘要；正文按篇加载，Notes 全文索引在首次搜索时加载。搜索文本与反向链接在构建时生成；浏览器只在首次非空搜索时整理匹配文本，后续复用缓存。
- Blog/Notes 文章标题统一使用花体，样式集中在 `src/styles/content.css` 的 `.article-title`；列表样式共用该文件，阅读器正文、翻页和反向链接样式由 `src/content/reader/reader.css` 按需加载。
- `content/ContentPage.tsx` 统一 Blog/Notes 的查询路由、页面元信息、正文加载和错误状态；首页、Blog、Notes 与 404 页面共用 `components/layout/SiteLayout.tsx`。
- 全站共享 Home / Blog / Notes 导航，并提供 About / Explore / Contact 首页锚点；窄屏菜单支持键盘和 Escape 关闭。
- 从筛选列表打开正文时，链接携带 `q` 查询条件；阅读页的返回入口、文章翻页和笔记反向链接会保留该条件，刷新或新标签页打开同样有效。直接打开不带 `q` 的文章仍返回完整列表。
- 编译与页面入口：`vite.config.ts`；检查命令：`package.json`。

详细语法见 [文章撰写](docs/writing.md)、[知识库说明](docs/notes.md)。

## 部署

GitHub 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。推送 `main` 或手动运行 `.github/workflows/deploy.yml` 后部署；PR 只运行检查。

构建产物为 `dist/`，部署到 [Alicia24012867.github.io](https://Alicia24012867.github.io/)。Vite 的 `base: '/'` 对应域名根目录；查询参数路由可直接访问和刷新。

未知路径由 GitHub Pages 返回 `dist/404.html`，保留原地址和 HTTP 404 状态；页面提供首页、Blog、Notes 入口，资源和导航使用根路径，支持任意层级的错误地址。本地 `dev` 和 `preview` 通过 `scripts/not-found.mjs` 提供相同的 404 行为：按文件版本复用模板读取与 HTML 转换，编辑或重新构建后自动更新，HEAD 请求不加载正文。`/blog/?post=不存在的文章` 和 `/notes/?post=不存在的笔记` 仍显示各自的内容缺失提示。
