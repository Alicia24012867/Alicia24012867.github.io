# Alicia · 在代码与蓝天之间

YangBo Huang 的蓝白色二次元个人主页，使用 React 19、TypeScript 和 Vite 构建，适用于 GitHub Pages。

我是一名对高性能计算、科学计算与机器学习感兴趣的学生，正在探索高性能数值计算、GPU 编程和机器学习系统。

- GitHub：[Alicia24012867](https://github.com/Alicia24012867)
- Email：[hyb24@mails.tsinghua.edu.cn](mailto:hyb24@mails.tsinghua.edu.cn)

## 本地运行

需要 Node.js 22.12+（推荐 Node.js 24）。在仓库根目录执行：

```sh
npm ci
npm run dev
```

开发地址为 `http://127.0.0.1:5173`。生产构建及预览：

```sh
npm run build
npm run preview
```

构建结果位于 `dist/`，可以部署到任意静态服务器，不需要 Node.js 服务端或数据库。

## GitHub Pages

1. 将代码推送至此仓库的 `main` 分支。
2. 在 GitHub 仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
3. 等待 `Deploy homepage to GitHub Pages` 工作流成功。也可在 Actions 页面手动运行。

此仓库对应的地址为 **https://Alicia24012867.github.io/Alicia24012867/**。这是普通项目仓库；如需使用根地址 `https://Alicia24012867.github.io/`，仓库名需为 `Alicia24012867.github.io`。

Vite 使用相对资源路径 `base: './'`，同时兼容仓库子路径和根域名部署。页面使用锚点导航，不依赖服务端路由，不会产生静态托管深层路由 404。工作流在 PR 时验证构建，仅在推送 main 或手动运行时部署。

参考：[Vite 静态部署](https://vite.dev/guide/static-deploy.html#github-pages)、[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 修改内容

- `src/content.ts`：姓名、简介、邮箱、GitHub 链接、研究方向与学习资源。
- `src/App.tsx`：页面内容及交互。
- `src/styles.css`：蓝白主题、夜空主题、移动端布局和动效。
- `public/images/summer-sky.webp`：本地首页插画，也用于头像。
- `public/favicon.svg`：蓝白云朵图标。

包括响应式导航、研究方向弹窗、邮箱复制反馈、持久化主题选择、键盘焦点、跳过导航链接和减少动效支持。不包含虚构项目或文章，也不依赖外部图片服务。Google Fonts 为可选字体增强，加载失败时自动使用系统字体。

插画由内置 ImageGen 生成；完整提示词与素材说明见 [ASSETS.md](ASSETS.md)。
