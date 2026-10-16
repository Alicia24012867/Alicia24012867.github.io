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
  config/            个人资料、外链、研究方向和分区预设，以及静态分享地址规则
  content/           内容路由、标题区、元信息、标签、搜索和 URL 工具
    reader/          正文增强、独立目录状态、阅读进度、继续阅读、代码复制、章节链接、图表渲染、图片查看器、脚注与链接预览
    figures/         正文交互图及其计算
  hooks/             URL 查询状态、页面元信息与评论组件懒加载
  styles/            字体、主题、共享样式与 404 样式
  not-found.tsx      独立 404 入口
content/
  blog/              文章和附件
  notes/             笔记和附件
scripts/
  content/           内容发现、编译、清洗、校验和 Vite 插件
  share/             分享图渲染脚本、摘要规则与生成命令
  verify-build.mjs   构建依赖边界检查与包体积报告
  benchmark-*.mjs    编译、搜索、排序、分享页与内存基准
tests/              独立回归样例
docs/               撰写说明与性能记录
```

## 配置与视觉规范

- `src/config/profile.ts`：姓名、邮箱、GitHub 和个人介绍；`interests.ts`：研究方向与兴趣弹窗。
- `src/config/links.ts`：`homepageLinks` 是个人外链，`friendLinks` 是友情链接。空条目、空分组自动隐藏；两组均为空时隐藏该区块和对应导航。每个链接带网站图标：GitHub 使用站内线条图标，其他网站读取自己的 `/favicon.ico`，也可用 `icon` 指定图片（如头像）；图片加载失败时显示地球图标。
- `src/config/moods.ts`：首页心情卡片的文案。卡片按访客本地时间切换白天（6:00 起）、傍晚（17:00 起）和夜晚（20:00 起）的图标与配色，每天从对应时段的句子中轮换一句；零点到 6:00 仍属前一晚。每句不超过 32 个字符，以免卡片变宽。手机上卡片浮在标题上方的天空中；窄平板（601–760px）和窄于 340px 的屏幕放不下，仍隐藏。
- 夜间主题下，首页蓝天在可见时每隔 5–12 秒划过一颗流星；点击名字旁的 ✦ 或天空空白处，任何主题都会放出一颗。流星在文字后方飞过，最多同时四颗；首页滚出屏幕或标签页隐藏时暂停，系统开启减少动态效果时不出现。
- 首页 Right now 卡片在两项近况下方显示最近推送的 GitHub 公开仓库和最新一篇 Blog 文章。仓库跳过 fork、归档和主页 README 仓库，本站仓库显示为 This website；数据在卡片接近视口时由浏览器向 GitHub 请求。未登录的 GitHub 接口每个网络地址每小时只允许 60 次，所以每位访客半小时内最多请求一次，并在本地保存上次结果；请求失败时显示上次结果，没有结果时显示 GitHub 主页链接。最新文章在构建时确定，发布新文章后随部署更新。窄屏上卡片排在介绍下方。
- `src/styles/global.css`：全站字体、字号、圆角、页面边距与明暗主题变量。正文采用 Noto Sans SC 和系统回退；品牌、标题、导航栏和文章目录保留花体；代码使用等宽字体，公式保留专用字体。
- 字体由站点自己提供，不再连接 Google 字体服务（该服务在中国大陆无法访问，曾让页面空白等待）。`npm run fonts:fetch`（`scripts/fonts.mjs`）从 Google Fonts 取回与原来完全相同的字体文件（Noto Sans SC 400–700，Playfair Display 斜体 400–600，按字符范围切片）放进 `public/fonts/`，并生成全站样式引入的 `src/styles/fonts.css`；每页只下载正文用到的切片，四个 HTML 入口预加载两种字体的拉丁字符切片。新用的字重需落在区间内，修改字体或字重后重新运行该命令；Mermaid 读取全局字体变量。全站布局由 `SiteLayout` 复用，导航支持首页锚点、窄屏菜单、键盘和 Escape 关闭。
- 首页和文章可共用 `public/images/` 中的资源；蓝天主图为 `summer-sky.webp`。
- 网站图标是 `public/favicon.svg`；`public/apple-touch-icon.png` 是同一图案铺满方形、无透明的 180 px 版本，供 iPhone 和 iPad 添加到主屏幕时使用（系统自行裁成圆角）。修改网站图标后同步更新它，四个 HTML 入口都引用这两个文件。

## 发布内容

文章放在 `content/blog/`，笔记放在 `content/notes/`，支持 `.md` 和 `.html`。详细语法见 [文章撰写](docs/writing.md) 和 [知识库说明](docs/notes.md)。

| 行为     | Blog                                         | Notes                                  |
| -------- | -------------------------------------------- | -------------------------------------- |
| 分区来源 | YAML 的 `section`，留空默认为 Learning       | 第一层文件夹名，根目录归入 Other notes |
| 搜索范围 | 标题、摘要、标签和分区                       | 元信息及正文                           |
| 列表顺序 | 最新、最早、最近更新、标题；`pin: true` 优先 | 按标题排列                             |
| 相关阅读 | 同分区上一篇、下一篇                         | 指向当前笔记的反向链接                 |

分区由已发布内容自动生成，无需更改 React；`src/config/sections.mjs` 提供共享规则、介绍和排序预设。空目录与草稿不会创建分区。

- 路径决定地址：`content/blog/test.md` → `/blog/test/`，同时保留 `?post=test` 兼容旧链接；重命名或移动文件后需更新互链，旧地址没有自动重定向。新增或修改文章后运行 `npm run share:cards` 更新分享图。
- `draft: true` 排除发布。元信息、附件和文章互链在构建时校验；删除文章前需检查引用。
- 日期优先使用 YAML 的 `date` / `updated`，否则读取 Git 历史。统一显示 `Posted on`，后续编辑显示 `Edited on`。
- 每篇自动统计字数并估算阅读时间，阅读页显示 `1,234 words · 5 min read`，Blog 列表只显示 `5 min read`（沿用正文元信息样式，窄屏换行时行首不出现分隔点）：中文按汉字、英文按单词，中英混排相加；规则见 [文章撰写](docs/writing.md)。
- 专属附件放在内容目录内并使用相对路径；共享资源使用 `/images/文件名`。
- 较大的 JPEG / PNG 附件照片在构建时另存按显示尺寸缩小的副本：手机和普通电脑加载副本，更清晰的屏幕和图片查看器仍用原图，排版不变；规则见 [文章撰写](docs/writing.md)。
- 搜索 `q` 与 Blog 排序 `sort` 保存在 URL，正文返回、翻页和反向链接保留筛选条件；刷新和新标签页打开同样有效。
- Blog / Notes 正文末尾自动显示 Alicia 手写签名：逐笔书写、停留、逆序擦除。屏外或隐藏页签暂停；减少动态效果或打印时显示完整笔画。

## 分享图与静态分享地址

每篇已发布的 Blog 文章和笔记都有独立的静态地址，并配一张 1200×630 的标题卡片。构建为每篇文档输出真实的 `<集合>/<地址>/index.html`，地址规则由 `src/config/sharing.mjs` 统一生成，站点、静态页、sitemap、订阅源和正文互链共用同一份实现：

```text
content/blog/moments.md                      → /blog/moments/
content/blog/2026/note.md                    → /blog/2026/note/
content/notes/source/ta_timestep_control.md  → /notes/source/ta_timestep_control/
```

静态页复制入口外壳（同一份脚本、样式、订阅发现与主题设置），并逐篇写入 `canonical`、`og:title`、`og:description`、`og:type=article`、`og:url`、`og:image`、`twitter:card=summary_large_image` 以及 `article:published_time`、`article:modified_time`、`author`、`article:section`、`article:tag`；`<noscript>` 显示标题、摘要与原文链接。静态页头部还列出该篇的阅读器、正文与公式样式，浏览器与入口脚本同时下载，慢速手机上正文约早 0.57 秒显示（见 [性能与验证](docs/performance.md)）。首页与两个列表页使用首页分享图，并写入各自的 `canonical` 与 `og:url`。旧的 `?post=` 地址仍可阅读；浏览器执行 JavaScript 后同步标题、`og:type`、`canonical`、分享图与对应 `alt`。分享给社交平台时应使用静态地址：不执行 JavaScript 的爬虫访问查询参数地址时仍会读到列表页的元信息。所有公开链接与图片绝对地址统一使用 `https://nymphilia.com/`，本地预览也保持该正式域名。

分享图沿用蓝天主视觉：`public/images/summer-sky.webp` 顶部对齐裁切后叠加柔和的左向渐变与底部淡出，沿用首页蓝色配色、衬线斜体标题、细线与花体署名；摘要使用常规字重无衬线字体。文件位于 `public/images/share/<集合>/<地址>.<摘要>.jpg`，摘要由标题、摘要、作者、分区、域名、卡片版本和蓝天图片内容决定。卡片不绘制 Git 日期，避免提交文章后图片立即过期；文章页和元信息仍保留发布时间与编辑时间。

```sh
npm run share:cards   # 重新渲染全部分享图并删除过期文件（需要 Python 3 与 Pillow）
npm run share:check   # 只检查缺失或过期，CI 不需要 Python
```

构建、开发服务器和自动测试都会校验分享图：缺失或过期时构建失败并提示上面的命令，避免分享出旧图或旧标题。地址细节、卡片内容与校验范围见 [分享图与静态分享地址](docs/sharing.md)。旧的 `?post=<地址>` 链接继续可用（页脚、订阅与旧书签不受影响），但 `canonical`、sitemap 与站内链接都指向静态地址，`q` 与 `sort` 仍然保留列表筛选。

## 文章评论与留言簿

Blog 和 Notes 的正文及相关阅读下方提供 [giscus](https://giscus.app/) 评论区，首页 Contact 卡片下方另有留言簿（`/#guestbook`）。访客通过 GitHub 登录后评论或回应，讨论保存在本仓库的 **Announcements** 分类，由仓库维护者在 GitHub 管理。

- `src/config/comments.ts` 保存公开的仓库与分类 ID，不需要前端 token；首次接入需启用仓库 Discussions，并将 [giscus App](https://github.com/apps/giscus/installations/new) 安装到该仓库。
- 留言簿固定使用标题为 `Guestbook` 的讨论，与文章评论共用 `useCommentWidget` 的加载、主题同步和回链逻辑。
- 使用文章静态路径作为严格匹配的讨论标识，旧的 `?post=`、显式 `index.html`、搜索与排序参数共用同一个评论区；Blog 与 Notes 的同名文档互不混淆。重命名文章地址时需迁移对应讨论的标题与 giscus 严格匹配摘要，避免分出新讨论。
- 距评论区或留言簿约 1200 px（一屏半）时才加载官方 React 组件，通常在读者到达前就已显示完毕，iframe 继续使用懒加载；两处预留 giscus 尚无评论时的高度（375 px），加载时下方内容不会跳动；已有评论时，若读者已滑过评论区开头，评论向上展开，页面末尾的链接保持不动（两处都不作为浏览器的滚动锚点；Safari 不支持滚动锚定，仍会下移）。文章正文加载完成前，占位区至少一屏高，页脚不会先闪现再被推开；首页顶部和列表页不加载评论客户端。主题切换通过 giscus 配置消息更新，保留输入中的评论。
- 评论标题沿用花体，配色、边框与圆角延续站点风格。`public/giscus/` 提供 iframe 内的日间与夜间主题；颜色与 `src/styles/global.css` 同步维护。主题资源固定从 `nymphilia.com` 加载，本地预览需先发布这些资源。
- 模块加载失败时可重试，评论区始终提供 GitHub 讨论入口。`giscus.json` 限定正式域名、GitHub Pages 原域名与本地预览来源。

第一次评论或回应时，giscus 才创建对应讨论；没有评论的文章无需手工创建讨论。接入方式与主题配置见 [giscus 官方文档](https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md)。

## RSS / Atom 订阅

- RSS 2.0：[`/rss.xml`](https://nymphilia.com/rss.xml)
- Atom 1.0：[`/atom.xml`](https://nymphilia.com/atom.xml)

两种订阅源均包含所有已发布 Blog 文章的标题、纯文本摘要、全文、作者、标签、发布时间和原文链接，按发布时间倒序排列，不受置顶影响；不包含草稿和 Notes。页脚提供订阅入口，所有页面的 HTML 头部都有自动发现链接。

每次构建复用内容目录生成 XML，开发服务也提供相同地址并随内容修改刷新。Atom 保留文章更新时间；条目的 `guid` / `id` 继续使用原域名下的 `?post=` 旧地址作为稳定标识，Atom feed ID 也保留原值（由 `idBaseUrl` 配置），因此改标题或改地址规则都不会让读者重复收到旧文章，条目链接则指向静态分享地址。日期继承正文的 YAML / Git 规则，不以构建时间伪造更新；空集合仍生成有效订阅源，更新时间使用 Unix epoch。

站点正式域名与订阅元信息在 `src/config/feeds.mjs` 配置，本地预览也使用正式原文地址。全文放在 RSS 的 `content:encoded` 和 Atom 的 `content` 中，按阅读器没有站点样式和脚本来整理：照片使用原图，站内链接和附件写成完整地址，脚注等页内跳转留在条目内；公式只保留 MathML，代码块和表格去掉复制按钮与外框，任务清单显示为 ☑ / ☐，Mermaid 图表和交互图的位置换成指向原文的链接。语言与订阅源不同的文章（如中文文章）标明自己的语言。构建时附件地址取自本次构建写出的文件（Vite 内联进页面的小文件另写一份），开发服务器中按源文件路径列出。格式依据 [RSS 2.0](https://www.rssboard.org/rss-specification) 和 [Atom RFC 4287](https://www.rfc-editor.org/rfc/rfc4287.html)。

## 搜索引擎发现

[`/sitemap.xml`](https://nymphilia.com/sitemap.xml) 包含首页、Blog、Notes 列表和所有已发布文章、笔记的静态分享地址，与各页 `canonical` 保持一致。草稿、私有文件、404 和搜索排序参数不进入 sitemap。内容条目的 `lastmod` 取 YAML / Git 的实际发布时间或更新时间；首页和列表页不填写推测的日期，但会写入各自的 `canonical` 与首页分享图。

[`/robots.txt`](https://nymphilia.com/robots.txt) 允许公开页面抓取，并声明 sitemap 的绝对地址。两者在生产构建时生成，本地开发和预览也可直接访问；复用已有内容目录缓存，内容增删改后自动更新。格式遵循 [Sitemaps 协议](https://www.sitemaps.org/protocol.html)。

## 运行与维护

- `ContentPage` 共用静态地址路由、页面元信息、正文加载及错误状态；`ArticleHeader` 共用阅读页和加载状态的标题区。
- `scripts/share/spec.mjs` 决定分享图文案、摘要与文件名，`scripts/share/render_card.py` 负责渲染；`scripts/content/share.mjs` 生成静态分享页并在开发服务器提供相同地址。调整卡片文案、配色或版式时提升 `CARD_VERSION`，再运行 `npm run share:cards`。
- 首页只引入最新文章的标题、日期和地址（`virtual:articles/latest`），不加载文章列表。
- 列表只加载摘要，正文按篇加载；Notes 全文索引首次搜索时才加载，复用已有文章映射和分组。搜索文本按需归一化，连续扩展关键词时只筛选上次结果；不同搜索实例的缓存独立。
- 搜索结果标出关键词：Blog 与 Notes 的标题和摘要中命中的文字以浅蓝色标记，Notes 另在摘要下方显示正文中第一次命中处的前后文（窄屏最多两行，公式写作 `$…$`）。全文索引保留原文大小写，匹配时忽略大小写且不复制正文。从搜索结果打开文档时，正文中出现关键词的地方也以浅蓝色标出，点击或轻点页面后消失；单个字符或在正文中过于常见（平均每 200 字出现一次以上）的关键词不标记，公式与图表内部不标记。
- 目录高亮状态由 `ArticleToc` 内部维护，滚动切换高亮不触发正文组件重新渲染。标题位置缓存继续在尺寸、字体和折叠内容变化后刷新。
- 正文图片在页面内的查看器（`PhotoViewer`）中放大：链接到图片文件的图片和未加链接的图片按正文顺序组成一组，可用方向键、两侧按钮或在手机上左右滑动切换，Escape、关闭按钮或点击深色背景关闭，焦点回到最后查看的图片。链接到其他页面的图片保持原链接；按住 ⌘、Ctrl 或 Shift 点击仍在新标签页或新窗口打开原图。查看器状态独立于正文，切换图片不重新渲染文章。
- 阅读页导航栏底边的细线（`ReadingProgress`）显示读到哪里：正文顶部滑到导航栏下方时开始，正文最后一行出现时填满，由一颗发光小星引领；比一屏短的正文全部可见即填满。进度线仅作装饰，对读屏软件隐藏，打印时不显示；滚动时只移动线条，不触发布局计算。
- 脚注预览（`FootnotePreview`）：鼠标悬停或键盘聚焦脚注编号时，在编号旁显示脚注内容，鼠标可移入卡片点击其中的链接；手机上轻点编号先预览而不跳转，再点一次或点卡片里的 Go to footnote 才跳到文末。Escape、点击别处、窗口尺寸变化或跳转后关闭。卡片优先放在编号下方，空间不足时放到上方且不压住导航栏，始终留在屏幕边距内；读屏软件仍通过编号的 `aria-describedby` 读取脚注，预览本身对其隐藏，打印时不显示。
- 语言标注：构建时按正文汉字与其他单词的数量判断每篇文档的语言（代码与公式不计，可用元信息 `lang` 指定），阅读页正文据此标注 `lang`；标题、摘要、目录与卡片上的文字由 `src/content/language.mjs` 各自判断，读屏软件对中文内容使用中文语音。中文文档里的代码块保留英文排版，注释外观与原来一致。
- 链接预览（`LinkPreview`）：鼠标悬停约 0.3 秒或键盘聚焦指向同一集合其他文档的链接（Blog 之间、Notes 之间）时，显示目标的分享图、分区、发布日期、阅读时间、标题与摘要，数据来自阅读页已加载的列表摘要；手机轻点仍直接打开链接。卡片对读屏软件隐藏，链接文字照常朗读。脚注预览与链接预览共用 `ReaderPopover` 的开合、定位与关闭逻辑；换行的链接以指针所在的那一行定位。
- 章节链接（`useHeadingLinks`）：鼠标移到二至四级标题上时，标题末尾浮现 `#`；点击即跳到该章节，并把带锚点的正式地址（`https://nymphilia.com/…#…`）复制到剪贴板，`#` 上方短暂显示 Link copied。`#` 不占行宽，不改变标题换行；选中复制标题文字时不带 `#`。它只是鼠标的快捷方式，对读屏软件和 Tab 键隐藏（目录提供同样的链接），手机等无悬停设备及打印时不显示。
- 继续阅读（`ContinueReading`）：读者滚动时，每篇文档读到哪一段只保存在其浏览器的 localStorage 中（不上传、不用 Cookie），最多保留最近读过的 20 篇；读到 95% 视为读完，回到开头（不足 5%）或点 × 都会清除该位置。之后从顶部再次打开读到一半的文档时，屏幕底部中央浮现 Continue reading 小条并写出当时所在的章节，点击后平滑回到离开时的那一行；文章修改后段落数变化时按阅读比例回到相近位置，途中绘制的图表改变高度时也会继续对准该行。带锚点打开、浏览器已恢复滚动位置时不显示，自行滚动约一屏或跟随页内链接后自动收起；存储被禁用时只是不记位置。打印时不显示；保存与回位的计算在 `resume.ts`，有独立测试。
- 引用链接（`QuoteLinks`）：用鼠标选中正文中的一段文字后，选区下方浮现 Copy link to quote，点击即把指向这段文字的正式地址（`https://nymphilia.com/…#quote=…`）复制到剪贴板并短暂显示 Link copied，选区保持不变；手机上长按选中、选区停稳后显示 Share quote，调出系统分享面板并附上这段文字。短句整句写进地址，长段只记开头和结尾的几个词，文中重复出现的句子另记是第几处，地址保持简短。打开这样的地址时页面滚到这段文字并居中，以浅蓝色标出，点击或轻点页面任意处后消失；途中绘制的图表改变高度时仍对准该段（与继续阅读共用 `hold.ts`），不支持高亮的浏览器改为选中这段文字。文章改动后找不到原句时只正常打开文章。公式、图表、交互图、按钮和脚注编号不计入引用文字（选区跨过公式时整段仍会标出）；键盘或脚本做出的选择不弹出按钮，Escape、点击别处或窗口宽度变化时收起。按钮对读屏软件和 Tab 键隐藏，打印时不显示；查找与编码逻辑在 `quote.ts` 和 `textMap.ts`，有独立测试。
- 复制公式（`useFormulaCopy`）：复制的正文含有公式时，每个公式写成书写时的 TeX：行内为 `$…$`，独立公式为 `$$…$$` 并单独成行，取代浏览器默认粘贴出的乱码（KaTeX 的 MathML 与排版文字各一份，几乎一个字符一行）；选区只盖住公式的一部分时整个公式一起复制。纯文本保留浏览器原有的分段，富文本保留加粗、链接与代码块，链接和图片写成完整地址；章节链接的 `#`、代码块的 Copy 按钮与已画出的图表不复制（图表复制其源码）。不含公式的选区按浏览器原样复制。
- 正文用 `<figure data-figure="名称"></figure>` 放置交互图（名称登记在 `src/config/figures.mjs`，用法见 [文章撰写](docs/writing.md)）。每个交互图是独立的代码块，接近视口时才加载，加载前占位保留其高度。`timestep-control` 用于 ngspice 步长控制笔记：在 RC 低通电路上按 DCtran、CKTtrunc 与 CKTterr 的规则逐步计算，可调 reltol 并比较是否补偿 (k+1)!，图中显示接受的时间点、被拒绝的尝试、步长与相对精确解的误差；计算逻辑在 `src/content/figures/timestep.ts`，有独立测试。
- 日期排序每篇只解析一次日期。Mermaid、公式样式与阅读器按需加载；图表接近视口、签名进入视口后才初始化。
- `scripts/content/` 统一发现文件、清洗 HTML、渲染代码和公式、校验资源及互链，并生成摘要、正文和全文索引模块。
- 修改依赖时同时提交 `package.json` 和锁文件；修改内容路径时同步更新文档与互链。`package.json` 的 `overrides` 让 Mermaid 与正文共用同一版 KaTeX（Mermaid 11 自带的旧版有安全公告）；升级到自身要求 KaTeX 0.18 以上的 Mermaid 后可删除该项。

发布前除自动检查外，应在桌面与窄屏复核主题、心情卡片的三个时段、夜间流星、Right now 卡片、移动导航、兴趣弹窗、搜索排序、返回链接、目录定位、章节链接、引用链接、阅读进度、继续阅读、代码复制、公式复制、图片查看器、脚注与链接预览、公式、交互图、签名、评论区与留言簿、减少动态效果及 404。自动测试和构建不能代替浏览器与线上验收。

## 部署

GitHub 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。推送 `main` 或手动运行 `.github/workflows/deploy.yml` 后检查并部署；PR 只运行检查。构建成功与部署成功分别以 Actions 和 Pages 环境为准。

构建产物为 `dist/`，发布到 [nymphilia.com](https://nymphilia.com/)。GitHub Pages 的自定义域名与 DNS 需配置为 `nymphilia.com`；仓库内的站点配置只负责生成公开链接，不会修改 DNS 或 Pages 设置。`base: '/'` 对应域名根目录；多入口与查询参数路由无需服务器 SPA 回退。

未知路径返回 `dist/404.html`，保留原地址和 HTTP 404 状态，提供首页、Blog、Notes 入口；未发布的静态地址同样返回 404。地址与某篇已发布的文章或笔记相近时（拼写有误、连字符与下划线混用、大小写不同、少了所在文件夹、带了日期，或写的是标题里的词），说明下方列出最多三篇“Perhaps you meant”；找不到相近的文档时页面与原来相同。推荐只用各文档的地址与标题（`virtual:articles/titles`、`virtual:notes/titles`），随 404 页的脚本一起下载，不加载列表、正文或草稿；匹配规则在 `src/content/suggest.ts`，有独立测试。开发与预览服务采用相同的 404 行为；不存在的 `?post=` 显示各自集合的内容缺失提示。
