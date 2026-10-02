# 分享图与静态分享地址

每篇已发布的 Blog 文章和笔记都有一个独立静态地址，并配一张 1200×630 的标题卡片。浏览器、爬虫和社交平台读取同一份 HTML，不需要执行 JavaScript。

## 地址规则

| 文件                                          | 静态分享地址                             |
| --------------------------------------------- | ---------------------------------------- |
| `content/blog/moments.md`                     | `/blog/moments/`                         |
| `content/blog/2026/note.md`                   | `/blog/2026/note/`                       |
| `content/notes/source/ta_timestep_control.md` | `/notes/source/ta_timestep_control/`     |
| `content/notes/零散想法.md`                   | `/notes/零散想法/`（浏览器自动编码中文） |

- `src/config/sharing.mjs` 是唯一的地址生成规则，站点导航、构建期静态页、sitemap、订阅源和正文互链共用它；三个使用方的实现不会各自漂移。
- 构建为每篇文档输出真实的 `<集合>/<地址>/index.html`；开发服务器提供相同地址并随内容修改刷新，未知地址返回 `dist/404.html`。
- 旧的 `/blog/?post=<地址>` 与 `/notes/?post=<地址>` 继续可用，`canonical` 指向静态地址，页脚链接、订阅源和旧书签不会失效；`q`、`sort` 仍保留列表筛选。
- 两种地址的头部一致：列表条目带有该篇的静态地址与卡片路径（`share: { path, image }`），客户端渲染时更新 `canonical`、`og:url`、`og:image`、`og:image:alt`、`twitter:image` 与 `twitter:image:alt`；条目缺少卡片信息时保留入口 HTML 里的首页分享图。

## 静态页内容

静态页复制对应入口的 HTML 外壳（同一份脚本、样式、订阅发现链接和主题脚本），再逐篇替换：

| 标签                                                        | 内容                                   |
| ----------------------------------------------------------- | -------------------------------------- |
| `<title>`、`description`                                    | 文章标题与摘要                         |
| `og:type`                                                   | `article`                              |
| `og:title`、`og:description`、`og:url`、`og:image`          | 标题、摘要、静态地址、分享图绝对地址   |
| `og:image:width`、`og:image:height`、`og:image:alt`         | `1200`、`630`、卡片说明                |
| `twitter:card` 及 `twitter:title` / `description` / `image` | `summary_large_image` 与同一张卡片     |
| `article:published_time`、`article:modified_time`           | YAML 或 Git 解析出的发布时间与编辑时间 |
| `article:author`、`article:section`、`article:tag`          | 作者、分区与标签                       |
| `<link rel="canonical">`                                    | 静态地址                               |

`<noscript>` 会替换为标题、摘要和原文链接。首页、Blog 列表和 Notes 列表由构建写入各自的 `canonical`、`og:url` 与首页分享图，因此每个页面都有分享预览。

## 分享图

- 沿用蓝天主视觉：`public/images/summer-sky.webp` 顶部对齐裁切，叠加与首页相同的左向渐变和底部淡出，标题沿用站点的衬线字体回退链，配色取自 `src/styles/global.css`。
- 输出 1200×630 渐进式 JPEG（质量 88），每张约 80 KB：社交平台都支持，仓库体积也可控。
- 文件名为 `public/images/share/<集合>/<地址>.<摘要>.jpg`，摘要取标题、摘要、日期、编辑时间、分区、`CARD_VERSION` 与蓝天图片内容的 SHA-256 前 10 位。
- 任何一项输入变化都会产生新文件名，构建与测试据此判断卡片是否过期，不会出现“标题改了分享图还是旧的”。

```sh
npm run share:cards   # 渲染全部分享图，并删除不再被引用的旧文件
npm run share:check   # 只检查缺失或过期，CI 不需要 Python
```

生成需要 Python 3 与 Pillow（`python3 -m pip install Pillow`），`SHARE_PYTHON` 可以指定解释器。渲染使用系统中文字体与衬线字体（macOS 上为 New York Italic、Baskerville、Songti SC、Hiragino Sans GB），`SHARE_CARD_FONT_DIR` 可以指向包含同名字体的目录；其他平台重新生成会得到不同字形，因此已提交的图片不在 CI 中重新渲染。

调整卡片文案、配色或版式时，先修改 `scripts/share/render_card.py` 或 `scripts/share/spec.mjs`，提升 `CARD_VERSION`，再运行 `npm run share:cards`。

## 校验

- 生产构建在生成静态页时解析分享图清单，缺失即报错并提示运行 `npm run share:cards`；开发服务器在访问静态页时报同样的错误。
- `npm test` 检查每篇已发布文档都有当前摘要对应的 1200×630 卡片、静态页会替换头部标签并在缺少标签时报错、开发与预览都能返回文章页面且未发布地址返回 404。
- `scripts/verify-build.mjs` 检查 sitemap 中的每个静态地址都有页面、`canonical` 绝对且与地址一致、`og:image` 命中真实的 1200×630 图片、页面仍然加载站点脚本，并且不再引用 `?post=`。
- 自动检查不能代替真实抓取：发布后建议用社交平台的调试工具确认卡片预览，并在桌面与窄屏浏览器中打开一篇文档，检查标题、目录、正文和返回列表链接。
