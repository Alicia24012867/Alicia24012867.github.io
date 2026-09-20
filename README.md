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
  home/              首页区块与交互
  blog/              文章列表、阅读页、目录索引
  notes/             知识库列表、阅读页、目录索引
  components/        共享布局、阅读组件、标签、图标与主题切换
  config/            个人资料、Blog 分区、Notes 主题
  content/           内容类型、索引与 URL 工具
  hooks/             搜索状态与页面元信息
  styles/            全局样式与内容页样式
content/
  blog/              文章和附件
  notes/             笔记和附件
scripts/content/     内容编译、校验和 Vite 插件
tests/              编译、索引与插件测试
docs/               撰写说明与素材记录
```

## 内容与配置

- 个人资料：`src/config/profile.ts`；研究方向：`src/config/interests.ts`。
- Blog 分区：`src/config/sections.mjs`；Notes 主题：`src/config/noteTopics.ts`。
- 新文章放入 `content/blog/`，新笔记放入 `content/notes/`，支持 `.md` 和 `.html`。
- 文件路径决定地址：`content/blog/test.md` → `/blog/?post=test`。目录迁移不改变现有线上地址。
- `draft: true` 排除发布；本地附件和文章互链在构建时校验。
- 列表仅加载摘要；正文按篇加载，Notes 全文索引在首次搜索时加载。搜索文本与反向链接在构建时生成。
- 编译与页面入口：`vite.config.ts`；检查命令：`package.json`。

详细语法见 [文章撰写](docs/writing.md)、[知识库说明](docs/notes.md)。素材记录见 [assets](docs/assets.md)。

## 部署

GitHub 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。推送 `main` 或手动运行 `.github/workflows/deploy.yml` 后部署；PR 只运行检查。

构建产物为 `dist/`，部署到 [Alicia24012867.github.io](https://Alicia24012867.github.io/)。Vite 的 `base: '/'` 对应域名根目录；查询参数路由可直接访问和刷新。

性能验证命令与本轮测量结果见 [性能记录](docs/performance.md)。
