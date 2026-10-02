# Alicia

React、TypeScript、Vite 多页面个人网站：主页 `/`、Blog `/blog/`、知识库 `/notes/`，以及独立的 404 页面。文本使用 UTF-8。

## 开发与验证

需要 Node.js 22.12+ 和 npm，CI 使用 Node.js 24。

```sh
npm ci
npm run dev          # 本地开发，内容修改后自动刷新
npm run format:check # 格式检查
npm run check        # 自动测试、类型检查、生产构建和依赖边界校验
npm run bundle:report
npm run preview      # 预览 dist/
```

需要格式化时运行 `npm run format`。测试样例由测试代码创建，不依赖线上文章数量或固定分类。验证方法与测量结果见 [性能与验证](docs/performance.md)。

## 目录与职责

```text
src/
  home/              首页区块与兴趣弹窗
  blog/              Blog 列表、分类排序与文章翻页
  notes/             知识库、全文搜索与反向链接
  components/        全站布局、导航、图标、主题与手写签名
  config/            个人资料、外链、研究方向和分区预设
  content/           内容路由、标题区、元信息、标签、搜索和 URL 工具
    reader/          正文增强、独立目录状态、代码复制与图表渲染
  hooks/             URL 查询状态与页面元信息
  styles/            字体、主题、共享样式与 404 样式
  not-found.tsx      独立 404 入口
content/
  blog/              文章和附件
  notes/             笔记和附件
scripts/
  content/           内容发现、编译、清洗、校验和 Vite 插件
  verify-build.mjs   构建依赖边界检查与包体积报告
  benchmark-*.mjs    编译、搜索与排序基准
tests/              独立回归样例
docs/               撰写说明与性能记录
```

## 配置与视觉规范

- `src/config/profile.ts`：姓名、邮箱、GitHub 和个人介绍；`interests.ts`：研究方向与兴趣弹窗。
- `src/config/links.ts`：`homepageLinks` 是个人外链，`friendLinks` 是友情链接。空条目、空分组自动隐藏；两组均为空时隐藏该区块和对应导航。
- `src/styles/global.css`：全站字体、字号、圆角、页面边距与明暗主题变量。正文采用 Noto Sans SC 和系统回退；品牌、标题、导航栏和文章目录保留花体；代码使用等宽字体，公式保留专用字体。
- 四个 HTML 入口加载相同字体，Mermaid 读取全局字体变量。全站布局由 `SiteLayout` 复用，导航支持首页锚点、窄屏菜单、键盘和 Escape 关闭。
- 首页和文章可共用 `public/images/` 中的资源；蓝天主图为 `summer-sky.webp`。

## 发布内容

文章放在 `content/blog/`，笔记放在 `content/notes/`，支持 `.md` 和 `.html`。详细语法见 [文章撰写](docs/writing.md) 和 [知识库说明](docs/notes.md)。

| 行为     | Blog                                         | Notes                                  |
| -------- | -------------------------------------------- | -------------------------------------- |
| 分区来源 | YAML 的 `section`，留空默认为 Learning       | 第一层文件夹名，根目录归入 Other notes |
| 搜索范围 | 标题、摘要、标签和分区                       | 元信息及正文                           |
| 列表顺序 | 最新、最早、最近更新、标题；`pin: true` 优先 | 按标题排列                             |
| 相关阅读 | 同分区上一篇、下一篇                         | 指向当前笔记的反向链接                 |

分区由已发布内容自动生成，无需更改 React；`src/config/sections.mjs` 提供共享规则、介绍和排序预设。空目录与草稿不会创建分区。

- 路径决定地址：`content/blog/test.md` → `/blog/?post=test`。重命名或移动文件后需更新互链，旧地址没有自动重定向。
- `draft: true` 排除发布。元信息、附件和文章互链在构建时校验；删除文章前需检查引用。
- 日期优先使用 YAML 的 `date` / `updated`，否则读取 Git 历史。统一显示 `Posted on`，后续编辑显示 `Edited on`。
- 专属附件放在内容目录内并使用相对路径；共享资源使用 `/images/文件名`。
- 搜索 `q` 与 Blog 排序 `sort` 保存在 URL，正文返回、翻页和反向链接保留筛选条件；刷新和新标签页打开同样有效。
- Blog / Notes 正文末尾自动显示 Alicia 手写签名：逐笔书写、停留、逆序擦除。屏外或隐藏页签暂停；减少动态效果或打印时显示完整笔画。

## RSS / Atom 订阅

- RSS 2.0：[`/rss.xml`](https://alicia24012867.github.io/rss.xml)
- Atom 1.0：[`/atom.xml`](https://alicia24012867.github.io/atom.xml)

两种订阅源均包含所有已发布 Blog 文章的标题、纯文本摘要、作者、标签、发布时间和原文链接，按发布时间倒序排列，不受置顶影响；不包含草稿和 Notes。页脚提供订阅入口，所有页面的 HTML 头部都有自动发现链接。

每次构建复用内容目录生成 XML，开发服务也提供相同地址并随内容修改刷新。Atom 保留文章更新时间；文章地址作为稳定 ID，改标题不会产生新条目。日期继承正文的 YAML / Git 规则，不以构建时间伪造更新；空集合仍生成有效订阅源，更新时间使用 Unix epoch。

站点正式域名与订阅元信息在 `src/config/feeds.mjs` 配置，本地预览也使用正式原文地址。摘要订阅无需解析正文附件，公式和图表可通过原文链接阅读。格式依据 [RSS 2.0](https://www.rssboard.org/rss-specification) 和 [Atom RFC 4287](https://www.rfc-editor.org/rfc/rfc4287.html)。

## 运行与维护

- `ContentPage` 共用查询路由、页面元信息、正文加载及错误状态；`ArticleHeader` 共用阅读页和加载状态的标题区。
- 列表只加载摘要，正文按篇加载；Notes 全文索引首次搜索时才加载，复用已有文章映射和分组。搜索文本按需归一化，连续扩展关键词时只筛选上次结果；不同搜索实例的缓存独立。
- 目录高亮状态由 `ArticleToc` 内部维护，滚动切换高亮不触发正文组件重新渲染。标题位置缓存继续在尺寸、字体和折叠内容变化后刷新。
- 日期排序每篇只解析一次日期。Mermaid、公式样式与阅读器按需加载；图表接近视口、签名进入视口后才初始化。
- `scripts/content/` 统一发现文件、清洗 HTML、渲染代码和公式、校验资源及互链，并生成摘要、正文和全文索引模块。
- 修改依赖时同时提交 `package.json` 和锁文件；修改内容路径时同步更新文档与互链。

发布前除自动检查外，应在桌面与窄屏复核主题、移动导航、兴趣弹窗、搜索排序、返回链接、目录定位、代码复制、公式、签名、减少动态效果及 404。自动测试和构建不能代替浏览器与线上验收。

## 部署

GitHub 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。推送 `main` 或手动运行 `.github/workflows/deploy.yml` 后检查并部署；PR 只运行检查。构建成功与部署成功分别以 Actions 和 Pages 环境为准。

构建产物为 `dist/`，发布到 [Alicia24012867.github.io](https://Alicia24012867.github.io/)。`base: '/'` 对应域名根目录；多入口与查询参数路由无需服务器 SPA 回退。

未知路径返回 `dist/404.html`，保留原地址和 HTTP 404 状态，提供首页、Blog、Notes 入口。开发与预览服务采用相同的 404 行为；不存在的 `?post=` 显示各自集合的内容缺失提示。
