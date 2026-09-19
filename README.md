# Alicia · 在代码与蓝天之间

YangBo Huang 的蓝白色二次元个人网站，使用 React 19、TypeScript 和 Vite 构建，适用于 GitHub Pages。网站由保持原有设计的个人主页，以及独立的「手记」文章区组成。

我是一名对高性能计算、科学计算与机器学习感兴趣的学生，正在探索高性能数值计算、GPU 编程和机器学习系统。

- GitHub：[Alicia24012867](https://github.com/Alicia24012867)
- Email：[hyb24@mails.tsinghua.edu.cn](mailto:hyb24@mails.tsinghua.edu.cn)

## 本地运行

需要 Node.js 22.12+（推荐 Node.js 24）。在仓库根目录执行：

```sh
npm ci
npm run dev
```

个人主页为 `http://127.0.0.1:5173/`，手记为 `http://127.0.0.1:5173/blog/`。两者通过顶部按钮跳转。生产构建及预览：

```sh
npm run build
npm run preview
```

构建结果位于 `dist/`，其中 `index.html` 是主页，`blog/index.html` 是文章区；可以部署到任意静态服务器，不需要 Node.js 服务端或数据库。`npm test` 检查文章解析、HTML 清理、图片路径和元信息校验。

## GitHub Pages

1. 将代码推送至此仓库的 `main` 分支。
2. 在 GitHub 仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
3. 等待 `Deploy homepage to GitHub Pages` 工作流成功。也可在 Actions 页面手动运行。

此仓库对应的地址为 **https://Alicia24012867.github.io/Alicia24012867/**。这是普通项目仓库；如需使用根地址 `https://Alicia24012867.github.io/`，仓库名需为 `Alicia24012867.github.io`。

Vite 使用多页面构建与相对资源路径 `base: './'`，同时兼容仓库子路径和根域名部署。主页使用锚点导航，文章通过 `blog/?post=test` 这样的查询参数打开，刷新及直接访问不需要服务端路由。工作流在 PR 时验证测试和构建，仅在推送 main 或手动运行时部署。

参考：[Vite 静态部署](https://vite.dev/guide/static-deploy.html#github-pages)、[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 修改内容

- `src/content.ts`：姓名、简介、邮箱、GitHub 链接、研究方向与学习资源。
- `src/App.tsx`：个人主页内容及交互。
- `blog/index.html` / `src/blog/`：独立文章页面、列表、阅读页及文章排版。
- `articles/`：以 Markdown 或 HTML 撰写的文章，构建时自动收录。
- `scripts/sections.mjs`：手记列表上预先写好的分区（学习、生活）。
- `articles/assets/`：随文章打包的图片与附件。
- `scripts/articles.mjs` / `scripts/articles-plugin.mjs`：在构建时解析、清理、排版和收录文章，主页不会加载 Markdown 解析器。
- `src/components/ThemeToggle.tsx`：两部分共用的主题切换，保留原有行为与外观。
- `src/styles.css`：蓝白主题、夜空主题、移动端布局和动效。
- `public/images/summer-sky.webp`：本地首页插画，也用于头像。
- `public/favicon.svg`：蓝白云朵图标。

包括响应式导航、研究方向弹窗、邮箱复制反馈、持久化主题选择、键盘焦点、跳过导航链接和减少动效支持。文章支持自动目录、代码高亮与复制、表格、引用、任务清单、数学公式、Mermaid 示意图、脚注、学习/生活分区、搜索、标签筛选、相邻文章及本地图片。不依赖外部图片服务。Google Fonts 为可选字体增强，加载失败时自动使用系统字体。

## 写文章

直接添加 `articles/my-note.md` 或 `articles/my-note.html`，保存后开发页面自动更新；推送并构建后进入线上文章列表。标题、日期、摘要和标签可以通过文件开头的 YAML 元信息设置，也可以省略并使用正文中的标题与首段。

详见 [文章撰写说明](articles/README.md)。已加入示例 [test.md](articles/test.md)，在 `/blog/?post=test` 可阅读并检查排版。示例用于验证正常文章中的段落、引用、代码、公式、示意图、表格、图片、脚注、分区及目录，后续可删除或设为草稿。

插画由内置 ImageGen 生成；完整提示词与素材说明见 [ASSETS.md](ASSETS.md)。
