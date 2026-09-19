# Alicia · 在代码与蓝天之间

YangBo Huang 的个人网站，使用 React 19、TypeScript 和 Vite 构建，适用于 GitHub Pages。网站由个人主页、独立的 Blog「手记」文章区，以及 Notes / Knowledge Base 个人知识库组成。

我是一名对高性能计算、科学计算与机器学习感兴趣的学生，正在探索高性能数值计算、GPU 编程和机器学习系统。

- GitHub：[Alicia24012867](https://github.com/Alicia24012867)
- Email：[hyb24@mails.tsinghua.edu.cn](mailto:hyb24@mails.tsinghua.edu.cn)

## 本地运行

需要 Node.js 22.12+（推荐 Node.js 24）。在仓库根目录执行：

```sh
npm ci
npm run dev
```

个人主页为 `http://127.0.0.1:5173/`，手记为 `http://127.0.0.1:5173/blog/`。知识库为 `http://127.0.0.1:5173/notes/`。三者通过顶部导航跳转。生产构建及预览：

```sh
npm run build
npm run preview
```

构建结果位于 `dist/`，其中 `index.html` 是主页，`blog/index.html` 是文章区；可以部署到任意静态服务器，不需要 Node.js 服务端或数据库。`npm test` 运行文章编译及目录集成测试，覆盖公式、脚注、HTML 清理、元信息、互链、附件路径及草稿排除。`npm run typecheck` 可单独检查 TypeScript。

## GitHub Pages

1. 将代码推送至此仓库的 `main` 分支。
2. 在 GitHub 仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
3. 等待 `Deploy homepage to GitHub Pages` 工作流成功。也可在 Actions 页面手动运行。

此仓库是 GitHub User Pages 仓库，对应的地址为 **https://Alicia24012867.github.io/**。仓库名称必须保持为 `Alicia24012867.github.io`，以便发布到根地址。

Vite 使用多页面构建，并以根路径 `base: '/'` 生成资源地址，适配 User Pages 域名根目录部署。主页使用锚点导航，文章通过 `blog/?post=test` 这样的查询参数打开，刷新及直接访问不需要服务端路由。工作流在 PR 时验证测试和构建，仅在推送 main 或手动运行时部署。

参考：[Vite 静态部署](https://vite.dev/guide/static-deploy.html#github-pages)、[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 修改内容

- `src/content.ts`：姓名、简介、邮箱、GitHub 链接、研究方向与学习资源。
- `src/App.tsx`：个人主页内容及交互。
- `blog/index.html` / `src/blog/Blog.tsx`：文章区入口、页面选择与共享外壳。
- `src/blog/ArticleIndex.tsx` / `ArticleReader.tsx` / `ArticleMeta.tsx`：文章列表、阅读页与共享元信息组件。
- `src/blog/ArticleToc.tsx`：从正文二、三级标题生成的目录，支持当前章节标记、长目录跟随与窄屏布局。
- `src/blog/useSearchQuery.ts` / `useArticleReader.ts`：URL 搜索状态、目录高亮、代码复制及图表生命周期。
- `articles/`：以 Markdown 或 HTML 撰写的文章，构建时自动收录。
- `scripts/sections.mjs`：手记列表上预先写好的分区（学习、生活）。
- `articles/assets/`：随文章打包的图片与附件。
- `scripts/articles.mjs`：文章编译入口；`scripts/articles/` 分离元信息校验、Markdown 扩展、HTML 清理/排版、链接解析与文章目录校验。
- `scripts/articles-plugin.mjs`：将编译结果接入 Vite 虚拟模块与开发时热更新，主页不会加载 Markdown 解析器。
- `src/components/ThemeToggle.tsx`：两部分共用的主题切换，保留原有行为与外观。
- `src/styles.css`：蓝白主题、夜空主题、移动端布局和动效。
- `public/images/summer-sky.webp`：本地首页插画，也用于头像。
- `public/favicon.svg`：蓝白云朵图标。

包括响应式导航、研究方向弹窗、邮箱复制反馈、持久化主题选择、键盘焦点、跳过导航链接和减少动效支持。文章支持自动目录、代码高亮与复制、表格、引用、任务清单、数学公式、Mermaid 示意图、脚注、学习/生活分区、搜索、标签筛选、相邻文章及本地图片。不依赖外部图片服务。Google Fonts 为可选字体增强，加载失败时自动使用系统字体。

搜索与标签点击会同步到 `?q=关键词`，刷新、分享链接或从文章后退时保留筛选。数学公式在构建时生成可视内容及 MathML；Mermaid 仅在包含图表的阅读页按需加载，主题切换的渲染会串行处理，失败时保留源码。Mermaid 的复杂布局依赖会产生较大的懒加载分块，构建时仍可能提示体积警告；它们不进入主页的首屏依赖。

## 写文章

直接添加 `articles/my-note.md` 或 `articles/my-note.html`，保存后开发页面自动更新；推送并构建后进入线上文章列表。标题、日期、摘要和标签可以通过文件开头的 YAML 元信息设置，也可以省略并使用正文中的标题与首段。

详见 [文章撰写说明](articles/README.md)。已加入示例 [test.md](articles/test.md)，在 `/blog/?post=test` 可阅读并检查排版。示例用于验证正常文章中的段落、引用、代码、公式、示意图、表格、图片、脚注、分区及目录，后续可删除或设为草稿。

插画由内置 ImageGen 生成；完整提示词与素材说明见 [ASSETS.md](ASSETS.md)。

## 知识库 Notes

`/notes/` 独立收录 `notes/content/` 中的笔记，按公式、源码阅读、CUDA API、SPICE 算法组织，支持全文搜索、标签筛选、笔记互链与反向链接。Blog 保留完整文章，Notes 用来维护持续修订的知识条目。

入口为 `notes/index.html` / `src/notes/Notes.tsx`。撰写与目录规则见 [知识库说明](notes/README.md)。
