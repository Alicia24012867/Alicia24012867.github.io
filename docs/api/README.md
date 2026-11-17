# 博客后端的接口约定

网站的页面通过 `nymphilia.com/api/` 向博客后端（`server/`，用 Rust 写，见 [docs/backend/](../backend/README.md)）要数据。这里约定后端该怎么回答：

- [`openapi.yaml`](openapi.yaml)：完整的接口约定（OpenAPI 3.1）。以它为准，本页用中文逐条解释。
- [`fixtures/private/`](fixtures/private/)：一份虚构的私有目录，接口测试和模拟后端都用它。

约定可以改。改的时候，接口测试（`web/scripts/api/check.mjs`）和模拟后端（`web/scripts/api/mock.mjs`）也要跟着改，`npm --prefix web test` 会确认三者一致。

## 三件工具

| 工具           | 命令（在 `web/` 里运行）                                           | 用途                                                       |
| -------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| 模拟后端       | `npm run api:mock`（单独运行，端口 8787），或者 `npm run dev` 自带 | 按约定返回假数据。前端不用等真正的后端，就能先做完、先测好 |
| 接口测试       | `npm run api:check -- <后端地址>`                                  | 逐条检查一个后端是否符合约定                               |
| 测试用登录服务 | `npm run api:issuer`                                               | 本机上的 auth.nymphilia.com，接口测试用它登录              |

### 模拟后端

`npm run dev` 启动开发服务器时，`/api/` 由模拟后端回答。它有：

- 4 位虚构的读者，在 `/api/auth/login` 跳转到的页面里选一位就算登录：
  - Alicia：管理员（`admin`）
  - Mum：`family`
  - Mei：`friends`
  - Visitor：不在任何分组
- 几条评论、Moments、订阅者和一封群发邮件，以及每个页面的阅读量和点赞数。
- 私密文章：`fixtures/private` 里的示例，加上网站自己 `content/locked/` 里的文章（如果有）。

数据只在内存里，重启后恢复原样。确认订阅这类“发出的邮件”打印在终端里。

想让开发服务器改用你自己的后端，启动时设置 `BLOG_API`：

```bash
BLOG_API=http://localhost:8080 npm run dev
```

这时 `/api/` 原样转给 `http://localhost:8080`，页面和后端看起来同源，Cookie 照常工作。

### 接口测试

```bash
npm run api:check -- http://localhost:8080
npm run api:check -- http://localhost:8080 --only auth,private
```

它先读 `/api/health`。回答里 `features` 列出的功能才检查，没列出的跳过，所以每完成一个里程碑，就把对应的功能加进去。每一项检查都发出真实的请求，按约定核对状态码、`Content-Type` 和 JSON 的每个字段。不符合时，它说明哪里不对，并附上后端的回答。

检查会留下评论、点赞、订阅者等测试数据，所以要对一个**空数据库**的后端运行，不要对线上的后端运行。

| 功能            | 里程碑 | 主要检查                                                                                |
| --------------- | ------ | --------------------------------------------------------------------------------------- |
| `auth`          | R3     | 登录跳转带 PKCE、state、nonce；回调；`/api/me`；登出；拒绝外站请求；back-channel logout |
| `private`       | R4     | 按等级授权；原样返回私有目录里的文章和文件；路径穿越无效                                |
| `comments`      | R5     | 匿名评论待审核；HTML 清洗；回复；留言簿；审核；私密文章的评论                           |
| `stats`         | R6     | 每人每天只算一次阅读；点赞可取消；管理统计                                              |
| `moments`       | R7     | 照片摆正、缩小、去掉位置信息；按读者可见；分页                                          |
| `subscriptions` | R8     | 订阅总是同样的回答；确认和退订链接；群发                                                |

`--only` 之外的功能，只要 `/api/health` 列出了，也照样检查。除 `auth` 外，每个功能都需要登录，所以 `auth` 必须先完成。

### 用测试用登录服务检查你的后端

真正的后端要经 OIDC 登录，接口测试不能替它点登录页。测试用登录服务就是在本机运行的 `auth/`，用一个临时数据库：

- 登记了应用 `blog`，客户端密钥是 `contract-test-secret`，只允许跳回 `--site` 给的地址；
- 有 5 位已经“记住了设备”的读者，所以登录时不会停在任何页面：

  | 角色   | 名字         | 分组                      |
  | ------ | ------------ | ------------------------- |
  | admin  | 测试管理员   | admin                     |
  | family | 测试家人     | family                    |
  | friend | 测试朋友     | friends                   |
  | guest  | 测试访客     | （无）                    |
  | leaver | 测试离开的人 | friends，检查中途会被停用 |

开三个终端：

```bash
# 终端 1：测试用登录服务（在 web/ 里）
npm run api:issuer -- --site http://localhost:8080
```

```bash
# 终端 2：你的后端（在 server/ 里）
BLOG_SITE_ORIGIN=http://localhost:8080 \
BLOG_OIDC_ISSUER=http://localhost:3999 \
BLOG_OIDC_CLIENT_ID=blog \
BLOG_OIDC_CLIENT_SECRET=contract-test-secret \
BLOG_PRIVATE_DIR=../docs/api/fixtures/private \
BLOG_DATA_DIR=$(mktemp -d) \
cargo run
```

```bash
# 终端 3：接口测试（在 web/ 里）
npm run api:check -- http://localhost:8080
```

测试用登录服务停止后，它的数据库也随之删除。每次检查前，最好也给后端一个新的空数据目录（上面的 `mktemp -d` 就是）。

CI 每次推送都这样检查一遍：`server/` 的镜像、测试用登录服务和示例私有目录，全部在 Actions 里运行（见 `.github/workflows/server.yml`）。

## 后端的配置

后端只从环境变量读配置：

| 变量                      | 服务器上                     | 本机检查时                  | 含义                                                                               |
| ------------------------- | ---------------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| `BLOG_LISTEN`             | `0.0.0.0:8080`               | 默认即可                    | 监听的地址和端口                                                                   |
| `BLOG_SITE_ORIGIN`        | `https://nymphilia.com`      | `http://localhost:8080`     | 网站的源。用来检查 `Origin`，拼出 `redirect_uri` 和邮件里的链接                    |
| `BLOG_OIDC_ISSUER`        | `https://auth.nymphilia.com` | `http://localhost:3999`     | 登录服务                                                                           |
| `BLOG_OIDC_CLIENT_ID`     | `blog`                       | `blog`                      | 在登录服务登记的应用                                                               |
| `BLOG_OIDC_CLIENT_SECRET` | 在 `/srv/site/api/.env` 里   | `contract-test-secret`      | 应用的客户端密钥                                                                   |
| `BLOG_DATA_DIR`           | `/data`                      | 一个空目录                  | SQLite 数据库和 Moments 的照片                                                     |
| `BLOG_PRIVATE_DIR`        | `/private/current`           | `docs/api/fixtures/private` | 私有目录（见下文）。服务器上它可能还不存在，这时当作没有私密文章                   |
| `BLOG_MAIL_URL`           | 在 `.env` 里                 | 不设置                      | 发信通道的地址（见 [docs/mail/](../mail/README.md)）。不设置时，把邮件打印到日志里 |
| `BLOG_MAIL_KEY`           | 在 `.env` 里                 | 不设置                      | 发信通道的密钥                                                                     |
| `BLOG_VERSION`            | 构建时传入提交号             | 不设置                      | `/api/health` 回答的 `version`                                                     |
| `RUST_LOG`                | `info`                       | 随意                        | 日志详细程度                                                                       |

服务器上，`/srv/site/api/.env` 只有你能读，里面放密钥：

```sh
BLOG_OIDC_CLIENT_SECRET=…
BLOG_MAIL_URL=https://script.google.com/macros/s/…/exec
BLOG_MAIL_KEY=…
```

## 通用规则

- **格式：** 请求和回答都是 UTF-8 的 JSON，上传照片（multipart）和文件除外。
- **时间：** RFC 3339 格式的 UTC 时间，例如 `2026-11-17T05:30:00Z`。
- **页面：** 用它在网站上的路径表示，例如 `/blog/before_20th_birthday/`、`/notes/source/ta_timestep_control/`。路径的每一段都按 `encodeURIComponent` 编码，以 `/` 结尾。后端认识的页面，就是私有目录清单里列出的那些，公开和私密的都在里面。
- **错误：** 一律是 `{"error": "…", "message": "…"}`。`error` 是固定的几个词之一（`bad_request`、`unauthorized`、`forbidden`、`not_found`、`too_many_requests`、`payload_too_large`、`server_error`），`message` 是给人看的英文说明。
- **会话：** 登录后，后端设置自己的会话 Cookie，要带 `HttpOnly` 和 `SameSite=Lax`，经 https 时还要 `Secure`。页面不读它。
- **访客 Cookie：** 为了记住没登录的读者点过的赞、一天只算一次阅读，后端可以再设一个长期的 Cookie，规则同上。
- **防跨站请求：** 所有 POST、PUT、PATCH、DELETE 都必须带 `Origin` 头，并且等于 `BLOG_SITE_ORIGIN`，否则回答 403。唯一的例外是 `/api/auth/backchannel-logout`，它由登录服务的服务器调用。
- **缓存：** 回答因人而异时（几乎所有回答），带 `Cache-Control: no-store`。
- **私密文章的评论：** 和正文一样，只给能读这篇文章的人看，也只收他们的评论。

## 私有目录

网站每次构建，除了公开的 `web/dist`，还在 `web/dist-private` 写出私有目录，随发布放进服务器的 `/srv/site/private/<发布>/`，`current` 指向在线的那份。私密文章的正文和附件只出现在这里，不在公开的网站文件里。

```
private/
├─ manifest.json                    清单
├─ documents/<16 位十六进制>.json   每篇私密文章，一个文件
└─ files/<16 位十六进制>.<扩展名>   私密文章的图片和附件
```

`manifest.json` 的格式（约定里的 `PrivateManifest`）：

```json
{
  "version": 1,
  "levels": ["friends", "family"],
  "pages": [
    {
      "path": "/blog/contract-open/",
      "title": "An open page",
      "date": "2026-01-02",
      "level": null
    },
    {
      "path": "/blog/contract-friends/",
      "title": "For friends",
      "date": "2026-01-03",
      "level": "friends",
      "document": "documents/e0d54cdbd7d9d3a8.json"
    }
  ],
  "files": {
    "2ea4b309e80c9328.png": { "type": "image/png", "level": "friends" }
  }
}
```

- **`levels`：** 等级从低到高排列。每个等级的名字也是登录服务里一个分组的名字。读者属于某个等级的分组，就能读这一级和更低的等级；管理员（`admin` 分组）能读全部。
- **`pages`：** 网站的全部页面。公开页面的 `level` 是 `null`，没有 `document`。评论、点赞、阅读量和群发邮件里出现的页面，都必须在这里。
- **`files`：** 私密文章用到的文件，文件名是内容的哈希。`level` 是用到它的文章里最低的那一级。
- **文章文件：** `documents/` 里的 JSON 由 `/api/private/document` 原样返回，后端不需要理解里面的内容。文章里的图片地址已经是 `/api/private/files/<名字>`。

后端每次读文件时，都要确认名字在清单里，不要拿请求里的名字直接拼路径。新的发布上线时 `current` 会换成另一个目录，所以不要一直缓存旧的清单：例如每次请求读一次，或者清单的修改时间变了就重读。

## 各部分接口

下面的“读者”指发出请求的人：没登录、已登录的普通读者或管理员。标注“管理”的接口只给管理员：没登录回答 401，不是管理员回答 403。

### 健康检查

`GET /api/health` → `{"ok": true, "version": "<提交号>", "features": ["auth", …]}`

服务器和 CI 靠它判断后端是否正常启动。`features` 只列出已经完成的功能。

### 登录和会话（R3）

| 接口                                | 作用                                                              |
| ----------------------------------- | ----------------------------------------------------------------- |
| `GET /api/auth/login?next=/blog/…/` | 302 跳到登录服务的授权地址                                        |
| `GET /api/auth/callback`            | 登录服务跳回这里；成功后 303 回到 `next`                          |
| `POST /api/auth/logout`             | 结束会话，回答 `{"redirect": "…"}`，页面再跳过去                  |
| `POST /api/auth/backchannel-logout` | 登录服务通知某人已登出或被停用                                    |
| `GET /api/me`                       | `{"user": null}` 或 `{"user": {"id", "name", "groups", "admin"}}` |

- **登录：** 跳转地址带上 `response_type=code`、`client_id`、`redirect_uri=<网站>/api/auth/callback`、`scope=openid profile groups`、新生成的 `state` 和 `nonce`，以及 PKCE（`code_challenge`，`code_challenge_method=S256`）。`state`、`nonce` 和 PKCE 的 verifier 存在一个短期 Cookie 或服务端，回调时取回。`next` 只接受本站以 `/` 开头的路径，`//evil.example/` 这类和外站地址一律换成 `/`。
- **回调：** 核对 `state`，用客户端密钥和 PKCE verifier 换取令牌，验证 ID token（签名、`iss`、`aud`、`nonce`、过期时间），建立会话。读者在登录页取消时（`error=access_denied`），不建立会话，直接回到 `next`。`state` 不认识时回答 400。
- **身份：** `id` 是 ID token 的 `sub`，`name` 和 `groups` 也来自 ID token；`admin` 等于 `groups` 里有 `admin`。
- **登出：** 删除会话，回答登录服务的 `end_session_endpoint`，带 `id_token_hint` 和 `post_logout_redirect_uri=<网站>/`。读者在那里还可以选择让这台设备也退出。
- **back-channel logout：** 请求是表单，字段 `logout_token`。验证它的签名、`iss`、`aud`、`iat`、`events` 里有 `http://schemas.openid.net/event/backchannel-logout`，并且没有 `nonce`；然后结束 `sid` 对应的会话，没有 `sid` 时结束这个 `sub` 的全部会话。无效的令牌回答 400。管理员在登录服务停用某人时，它就靠这个在几秒内生效。

### 私密文章（R4）

| 接口                                      | 作用                                  |
| ----------------------------------------- | ------------------------------------- |
| `GET /api/private/document?path=/blog/…/` | 一篇私密文章的 JSON，原样来自私有目录 |
| `GET /api/private/files/<名字>`           | 私密文章的图片或附件                  |

- 没登录回答 401，等级不够回答 403。
- 公开页面、清单里没有的页面回答 404；`path` 不是页面路径的样子回答 400。
- 文件的 `Content-Type` 用清单里的 `type`，另外带 `Cache-Control: private, max-age=86400` 和 `X-Content-Type-Options: nosniff`。文件名随内容变，所以可以缓存一天。

### 评论和留言簿（R5）

| 接口                                              | 作用                                        |
| ------------------------------------------------- | ------------------------------------------- |
| `GET /api/comments?thread=<页面路径或 guestbook>` | 一个讨论串里已发布的评论，从早到晚          |
| `POST /api/comments`                              | 写评论                                      |
| `GET /api/admin/comments?status=pending`          | 管理：审核列表，从新到旧，分页              |
| `PATCH /api/admin/comments/<id>`                  | 管理：`{"status": "published" 或 "hidden"}` |
| `DELETE /api/admin/comments/<id>`                 | 管理：删除评论和它的回复                    |

- **讨论串：** 文章的路径，或者 `guestbook`（留言簿）。
- **写评论：** `{"thread", "body", "parentId"?, "name"?, "email"?, "website"?}`。
  - `body` 是 Markdown，1 到 4000 个字符。后端保存原文，回答清洗后的 HTML：不能有脚本、样式、`javascript:` 链接等能在页面里运行的东西。
  - 没登录的读者必须填 `name`，评论等待审核（`status: pending`），不立刻显示；`email` 选填，只有管理员看得到。
  - 登录的读者直接发布（`status: published`），名字用登录身份的名字，忽略填写的 `name`。
  - `parentId` 指向被回复的评论。回复的回复也挂在同一条顶层评论下，所以 `parentId` 总是顶层评论。指向不存在的评论回答 400。
  - `website` 是给机器人的陷阱：页面里看不见这个输入框，填了它的请求照样回答 201，但什么也不保存。
  - 同一位读者短时间内评论太多，回答 429，并带 `Retry-After`。
- **审核：** 发布或隐藏后，公开的列表立刻随之变化。`status` 只能改成 `published` 或 `hidden`。

### 阅读量和点赞（R6）

| 接口                                 | 作用                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `GET /api/pages/stats?paths=/a/,/b/` | 最多 50 个页面的 `{"views", "likes", "liked"}`                               |
| `POST /api/pages/view`               | `{"path"}`：记一次阅读，回答 204                                             |
| `POST /api/pages/like`               | `{"path", "liked": true/false}`：点赞或取消，回答最新的 `{"likes", "liked"}` |
| `GET /api/admin/stats?days=30`       | 管理：每天的阅读量，以及每个页面的阅读、点赞和评论数                         |

- 不认识的页面不出现在 `stats` 的回答里；`view` 和 `like` 遇到它回答 404。
- 同一位读者（登录身份，或访客 Cookie）同一天只算一次阅读，每个页面只能赞一次。点赞是幂等的：重复点赞不会多算。
- `liked` 表示**这位读者**是否点过赞。
- `days` 是 1 到 366，默认 30；回答里的 `days` 正好有这么多天，没有阅读的日子是 0。

### Moments（R7）

| 接口                                 | 作用                             |
| ------------------------------------ | -------------------------------- |
| `GET /api/moments?limit=20&before=…` | 这位读者能看的 Moments，从新到旧 |
| `GET /api/moments/photos/<名字>`     | 照片或缩略图                     |
| `POST /api/admin/moments`            | 管理：发一条（multipart）        |
| `PATCH /api/admin/moments/<id>`      | 管理：改文字或可见范围           |
| `DELETE /api/admin/moments/<id>`     | 管理：删除，连同照片             |

- **可见范围 `audience`：** `public`（所有人），或者一个分组名，例如 `friends`、`family`。属于这个分组的人能看；如果它也是私有目录里的一个等级，等级更高的人也能看；管理员能看全部。照片也遵守同样的规则，看不到的照片回答 404。
- **发布：** 表单字段 `text`（Markdown）、`audience`、最多 9 个 `photos`，以及和照片一一对应的 `alts`（图片说明）。文字和照片至少要有一样。不是图片的文件、分组名不合规范，都回答 400；太大回答 413。
- **照片处理：** 按 EXIF 方向摆正，**去掉所有元数据，尤其是拍摄位置**；保存长边不超过 2048 像素的一份，和长边不超过 480 像素的缩略图。
- **分页：** 回答里的 `next` 不为 `null` 时，把它作为下一次请求的 `before`。`limit` 是 1 到 50。

### 邮件订阅（R8）

| 接口                                         | 作用                                                       |
| -------------------------------------------- | ---------------------------------------------------------- |
| `POST /api/subscriptions`                    | `{"email", "website"?}`：订阅，总是回答 202                |
| `GET /api/subscriptions/confirm?token=…`     | 确认邮件里的链接，303 回到网站                             |
| `GET /api/subscriptions/unsubscribe?token=…` | 每封邮件里的退订链接，303 到网站上的确认页                 |
| `POST /api/subscriptions/unsubscribe`        | `{"token"}`：退订                                          |
| `GET /api/admin/subscribers`                 | 管理：订阅者名单和人数                                     |
| `DELETE /api/admin/subscribers/<id>`         | 管理：删除一位订阅者                                       |
| `GET /api/admin/newsletters`                 | 管理：发过的群发邮件                                       |
| `POST /api/admin/newsletters`                | 管理：`{"subject", "text", "path"?}`，群发给已确认的订阅者 |

- **订阅：** 不论这个地址是否已经订阅过，回答都一样（`{"status": "confirmation_sent"}`），别人无法借此知道谁订阅了。同一个地址一小时内最多发一封确认邮件。`website` 同样是机器人陷阱。
- **确认：** 有效的令牌跳到 `/?subscription=confirmed`，无效或过期的跳到 `/?subscription=invalid`，页面据此显示提示。
- **退订分两步：** 邮箱服务商会自动打开邮件里的链接，所以 GET 只跳到 `/?unsubscribe=<令牌>`，由页面问一句，读者确认后再 POST。不认识的令牌也回答 200：结果都是“不会再收到邮件”。
- **群发：** 回答 202 后在后台发送，`status` 从 `sending` 变成 `sent`，并记下发出和失败的数目。每封邮件都带这位订阅者自己的退订链接。`path` 指明邮件介绍的是哪篇新文章，它的标题和地址会写进邮件；后端不认识的路径回答 400。

## 部署和登记应用

- 后端以 Docker 镜像发布，容器名 `blog-api`，Caddy 把 `/api/` 转给它的 8080 端口。容器只读运行，用户 uid 1000，内存上限 128 MB，只能写 `/data` 和 `/tmp`。详见 [deploy/README.md](../../deploy/README.md)。
- 上线前，在 https://auth.nymphilia.com/admin 登记应用 `blog`：
  - 跳回地址 `https://nymphilia.com/api/auth/callback`
  - 登出后地址 `https://nymphilia.com/`
  - back-channel logout 地址 `https://nymphilia.com/api/auth/backchannel-logout`
  - 机密客户端，允许刷新令牌

  把显示一次的客户端密钥写进服务器的 `/srv/site/api/.env`。

- 想在本机用线上的 auth.nymphilia.com 登录，可以再登记一个应用 `blog-dev`：勾选 “Runs on someone's computer, with localhost addresses”，跳回地址 `http://localhost:8080/api/auth/callback`，登出后地址 `http://localhost:8080/`，不填 back-channel logout 地址（登录服务连不到你的电脑）。本机运行后端时，把 `BLOG_OIDC_CLIENT_ID` 和密钥换成它的。
