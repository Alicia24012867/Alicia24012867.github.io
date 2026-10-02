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
  config/            个人资料、Blog / Notes 分区预设
  content/           共享内容路由、标签、搜索索引、类型与 URL 工具
    reader/          正文、目录、代码复制与图表渲染
  hooks/             共用 URL 查询状态与页面元信息
  styles/            全局、内容页与 404 样式
content/
  blog/              文章和附件
  notes/             笔记和附件
scripts/
  content/           内容编译、校验和 Vite 插件
  verify-build.mjs   构建依赖检查与包体积报告
  benchmark-*.mjs    内容编译与搜索性能基准
tests/              编译、索引、路由与插件测试（独立样例）
docs/               撰写说明
```

## 内容与配置

- 个人资料：`src/config/profile.ts`；研究方向：`src/config/interests.ts`。
- 首页底部外链：`src/config/links.ts`，在 `homepageLinks` 中填写自己的主页（Elsewhere），在 `friendLinks` 中填写朋友网站（Friends · 友情链接）。每项填写 `name` 和 `url`；各组独立按数量和屏幕宽度自动换行，空条目和空分组不显示，两组均为空时隐藏整个区域。
- Blog 分区：根据文章 YAML 中的 `section` 自动生成，支持自定义中文或英文名称，无需改配置；省略或留空时默认 Learning。
- 例如填写 `section: 读书笔记` 即可创建同名分区；同名文章自动归组，支持按分区名称搜索与同分区文章翻页。分区导航和文章列表复用筛选、排序结果。
- Notes 分区：根据 `content/notes/` 下的第一层文件夹名自动生成，例如 `机器学习/入门.md` 归入「机器学习」，更深层子目录归入同一分区；根目录笔记归入 Other notes，YAML 的 `section` 不影响 Notes 归类。
- Blog / Notes 共用 `src/config/sections.mjs` 中的分区逻辑与展示预设，保留配置中保留的分区名称、介绍和顺序；新分区按名称排序。仅展示有已发布内容的分区，草稿与空文件夹不会创建分区。
- 新文章放入 `content/blog/`，新笔记放入 `content/notes/`，支持 `.md` 和 `.html`。
- 文件路径决定地址：`content/blog/test.md` → `/blog/?post=test`。目录迁移不改变现有线上地址。
- `draft: true` 排除发布；本地附件和文章互链在构建时校验。
- Blog 和所有 Notes 分类统一显示 `Posted on`，有后续编辑时显示 `Edited on`；日期自动读取 Git 历史，也可通过 `date` / `updated` 指定。
- 列表仅加载摘要；正文按篇加载，Notes 全文索引在首次搜索时加载。搜索文本与反向链接在构建时生成；浏览器只在首次非空搜索时整理匹配文本，后续复用缓存。
- Blog/Notes 文章标题统一使用花体，样式集中在 `src/styles/content.css` 的 `.article-title`；列表样式共用该文件，阅读器正文、翻页和反向链接样式由 `src/content/reader/reader.css` 按需加载。
- Blog / Notes 每篇正文末尾自动显示 Alicia 签名，采用 Allura 字形，位于正文右下角，逐笔书写、停留后沿同一轨迹逆序擦除并循环重播；进入视口后才初始化动画，屏外或隐藏页签时暂停，减少动态效果或打印时显示同一套完整笔画，无需逐篇配置。
- `content/ContentPage.tsx` 统一 Blog/Notes 的查询路由、页面元信息、正文加载和错误状态；首页、Blog、Notes 与 404 页面共用 `components/layout/SiteLayout.tsx`。
- 全站共享 Home / Blog / Notes 导航，并提供 About / Explore / Contact 首页锚点；窄屏菜单支持键盘和 Escape 关闭。
- 从筛选列表打开正文时，链接携带 `q` 查询条件；阅读页的返回入口、文章翻页和笔记反向链接会保留该条件，刷新或新标签页打开同样有效。直接打开不带 `q` 的文章仍返回完整列表。
- Blog 列表支持分类内按最新发布、最早发布、最近更新或标题排序。搜索与排序由 `useListingQuery` 统一管理，通过 `q` / `sort` 查询参数保留，刷新、搜索及从文章返回列表后仍生效；默认最新发布，未编辑的文章以发布日期参与最近更新排序。
- Blog 文章可在开头的 YAML 中声明 `pin: true`，在所属分类及匹配的搜索结果中置顶并显示 `Pinned`；`pin: false` 或省略即不置顶。同为置顶或普通文章时继续按当前排序排列。
- 编译与页面入口：`vite.config.ts`；检查命令：`package.json`。

详细语法见 [文章撰写](docs/writing.md)、[知识库说明](docs/notes.md)。

## 从本地到发布

1. 安装 Node.js 22.12+；正式部署使用工作流中的 Node.js 24。首次检出运行 `npm ci`，依赖由锁文件固定。
2. 运行 `npm run dev`。终端会显示本地地址，可直接打开首页、Blog 或 Notes。
3. 在 `content/blog/`、`content/notes/` 中新增或修改文章。保存后开发服务会更新目录、正文和全文索引。
4. 运行 `npm run format:check` 与 `npm run check`。如有格式错误，先运行 `npm run format` 并审阅差异。
5. 运行 `npm run preview` 检查生产构建，确认搜索、阅读、主题与移动导航。
6. 提交并推送到 `main` 后，由 GitHub Actions 检查并部署。构建成功与部署成功是两个独立步骤，应在 Actions 和 Pages 环境中确认最终结果。

## 内容生命周期

- 文件名决定地址，修改标题不会改变地址；重命名、移动文件时需更新互链，旧地址没有自动重定向。
- 删除文章前搜索其文件名、slug 和附件引用。删除后运行构建，确认没有链接指向已移除内容。
- 所有模板和演示笔记均已从发布目录移除。集合目录为空或不存在时显示空列表，构建与测试不要求保留占位文章。
- 全站共享图片放在 `public/images/`，使用 `/images/文件名` 引用；文章专属附件放在内容目录内，通过相对路径引用。首页和文章共用同一份蓝天图片。
- 测试在代码中定义小样例或创建临时目录，不读取线上文章，也不要求固定分区名称或文章数量。

## 实现与维护边界

- `scripts/content/` 负责发现文件、解析元信息、清洗 HTML、渲染公式与代码、校验附件互链，以及生成摘要、正文和全文索引模块。
- `src/content/` 负责列表与阅读器共用逻辑；Blog 保留分类、置顶和日期排序，Notes 保留按主题检索与反向链接。
- `useListingQuery` 统一维护搜索和排序的 URL 状态及浏览器历史恢复；页面采用多入口与原生链接，无需服务器提供 SPA 回退。
- 正文、公式样式和 Mermaid 按需加载；日期排序每篇只解析一次日期；签名进入视口后才创建动画，减少动态效果时不创建动画。
- 文本使用 UTF-8。修改依赖时同时提交 `package.json` 和锁文件；修改内容路径时检查文档示例与正文互链。

## 稳定版验证

```sh
npm run format:check
npm run check
npm run bundle:report
npm run preview
```

自动检查覆盖内容编译、危险 HTML 清理、元信息、Git 日期、资源与互链、空目录、搜索、排序、导航 URL、目录锚点、404 和懒加载边界。发布前另外在桌面与窄屏检查：

- 首页兴趣弹窗、主题持久化和键盘关闭导航。
- Blog 标签搜索、四种排序、置顶与正文返回链接。
- Notes 正文关键词搜索、失败与空结果提示、阅读页及反向链接。
- 正文公式、代码复制、目录定位、签名书写与逆序擦除；减少动态效果和打印。
- 不存在的文章和不存在的路径，以及直接刷新深层地址。

验证范围、性能测量口径及本轮结果见 [性能与验证](docs/performance.md)。

## 部署

GitHub 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。推送 `main` 或手动运行 `.github/workflows/deploy.yml` 后部署；PR 只运行检查。

构建产物为 `dist/`，部署到 [Alicia24012867.github.io](https://Alicia24012867.github.io/)。Vite 的 `base: '/'` 对应域名根目录；查询参数路由可直接访问和刷新。

未知路径由 GitHub Pages 返回 `dist/404.html`，保留原地址和 HTTP 404 状态；页面提供首页、Blog、Notes 入口，资源和导航使用根路径，支持任意层级的错误地址。本地 `dev` 和 `preview` 通过 `scripts/not-found.mjs` 提供相同的 404 行为：按文件版本复用模板读取与 HTML 转换，编辑或重新构建后自动更新，HEAD 请求不加载正文。`/blog/?post=不存在的文章` 和 `/notes/?post=不存在的笔记` 仍显示各自的内容缺失提示。
