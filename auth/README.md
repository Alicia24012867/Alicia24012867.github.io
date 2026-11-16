# 登录服务 auth.nymphilia.com

nymphilia.com 和以后的应用都在这里登录。它是标准的 OpenID Connect 服务，协议部分交给通过 OpenID 官方认证的 [oidc-provider](https://github.com/panva/node-oidc-provider)；邀请、通行密钥和管理页是自己写的。Node 24 直接运行 TypeScript，数据存在 SQLite 里。

## 怎么登录

- **邀请链接**：管理员在 `/admin` 为某人生成，有效期 1、7 或 30 天，只能用一次。打开后点一下按钮，这台设备就记住此人一年；浏览器支持时，页面会建议顺手加一个通行密钥。在微信里打开也能用。
- **通行密钥**：属于 `nymphilia.com`。管理员只用这种方式登录，管理页每 12 小时要求重新验证一次。
- 应用请求登录时，已经记住此人的设备直接回到应用，不再询问。

停用某人、删除某人或移除一台设备时，服务立刻向相关的应用发送 back-channel logout。此后，此人的刷新令牌和 `/me` 请求都会失败。

## 第一次使用

域名指向服务器、运行过 `go-live` 之后（见 [deploy/README.md](../deploy/README.md)）：

```sh
ssh nyc docker exec auth node src/cli.ts bootstrap --name <你的名字>
```

一小时内，在手机或电脑的浏览器里打开它打印的链接，创建通行密钥，随后进入 `/admin`。

其他命令：

```sh
ssh nyc docker exec auth node src/cli.ts setup-link               # 管理员的新通行密钥链接，比如换了手机
ssh nyc docker exec auth node src/cli.ts setup-link <名字或 id>   # 某个人的
ssh nyc docker exec auth node src/cli.ts people                   # 列出所有人
```

## 管理页 `/admin`

- **人**：名字、分组和邮箱（可选）；邀请链接；停用或恢复；删除；设备、通行密钥和最近的登录记录。给管理员的是通行密钥设置链接，不是邀请链接。
- **分组**：默认有 admin、friends、family，可以再加。应用按分组决定谁能看什么。
- **应用**：登记 OpenID Connect 应用。客户端密钥只显示一次；可以重新生成，旧的立刻失效。

## 应用怎么接入

博客后端就是这里的一个应用。登记后，应用需要知道这些：

- **配置信息**：`https://auth.nymphilia.com/.well-known/openid-configuration`，其中有各个端点的地址。
- **流程**：授权码流程，必须带 PKCE（S256）。保存密钥的应用用 HTTP Basic 发送客户端密钥（`client_secret_basic`）；不保存密钥的应用只靠 PKCE。
- **身份信息**：scope 用 `openid profile groups`。ID 令牌和 `/me` 都带 `sub`（不会变的 id）、`name` 和 `groups`。管理员填了邮箱时，`email` scope 给出 `email`（`email_verified` 为 false）。
- **令牌**：访问令牌和 ID 令牌 10 分钟，刷新令牌最长 30 天，都用 RS256 签名，公钥在 `/jwks`。允许刷新令牌的应用每次登录都会得到一个；每次刷新，应用都会得知停用和分组的变化。
- **登出**：把用户送到 `/session/end`。登出页上可以选择只登出这个应用（设备仍记得此人），或者让这台设备也忘掉此人。
- **back-channel logout**：服务把 `logout_token`（一个 JWT，带 `sub` 和 `sid`）POST 到应用登记的地址，应用验证签名后结束对应的会话。这个地址必须是公网地址：为防止 SSRF，服务不向 localhost 和内网地址发请求。
- **本地开发**：登记为本机应用（native）时，跳转地址可以用 `http://localhost/…` 或 `http://127.0.0.1/…`，端口任意。

## 本地开发

```sh
cd auth
npm ci
npm run dev      # http://localhost:3000，数据在 auth/data/，不进仓库
npm run check    # 格式、类型、资源副本检查和全部测试；通行密钥测试需要 Chrome
npm run format   # 按仓库根目录的 Prettier 设置排版代码
npm run assets   # 网站的字体样式或图标改动后，更新 public/ 里的副本
```

本地第一次使用时运行 `node src/cli.ts bootstrap --name <名字>`。

页面写在 `html` 模板字符串里，由手工排版：仓库的 `.prettierrc.json` 让 Prettier 不改动 `auth/` 里模板的内容，否则页面里的空白会变。

| 环境变量       | 默认值                   | 作用                                                    |
| -------------- | ------------------------ | ------------------------------------------------------- |
| `AUTH_ISSUER`  | `http://localhost:3000`  | 服务自己的地址；服务器上是 `https://auth.nymphilia.com` |
| `AUTH_RP_ID`   | issuer 的域名            | 通行密钥所属的域名；服务器上是 `nymphilia.com`          |
| `AUTH_HOME`    | `https://nymphilia.com/` | 登录页“返回网站”的去处，也是直接在这里登录后的去处      |
| `AUTH_RP_NAME` | `nymphilia.com`          | 密码管理器里通行密钥旁显示的名字                        |
| `AUTH_DATA`    | `data`                   | 数据库和密钥所在的文件夹                                |
| `PORT`         | `3000`                   | 端口                                                    |

用 `http://` 地址时，Cookie 不带 Secure 标记和 `__Host-` 前缀，只适合本地开发。

## 数据

服务器上的 `/srv/auth/data` 里有两样东西，都只在服务器上，不进仓库：

- `auth.db`：SQLite 数据库（WAL 模式），存人、分组、设备、通行密钥、链接、应用和记录。记录保留一年，过期的链接 30 天后删除。
- `keys.json`：签名密钥，第一次启动时生成。

DigitalOcean 的 Backups 会把它们一起备份。丢了 `keys.json`，应用手里的令牌全部失效，大家需要重新登录；丢了 `auth.db`，需要重新邀请所有人。

## 发布

推送 `main` 且 `auth/` 有改动时，`.github/workflows/auth.yml` 运行测试、构建镜像并试运行，再交给服务器；新镜像健康才上线，否则自动退回上一版。详见 [deploy/README.md](../deploy/README.md)。

## 代码

| 位置                                                                 | 内容                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/main.ts`、`src/config.ts`                                       | 启动和退出、每小时清理过期数据；从环境变量读取配置             |
| `src/provider.ts`                                                    | oidc-provider 的设置：令牌时长、身份信息、登出页               |
| `src/app.ts`、`src/routes.ts`、`src/http.ts`                         | 请求处理、页面路由、安全头和跨站请求检查                       |
| `src/pages.ts`、`src/html.ts`、`public/`                             | 页面和样式，沿用网站的字体和配色                               |
| `src/admin.ts`                                                       | 管理页                                                         |
| `src/people.ts`、`src/devices.ts`、`src/passkeys.ts`、`src/links.ts` | 人和分组、设备、通行密钥、邀请和设置链接                       |
| `src/sessions.ts`、`src/apps.ts`                                     | 结束会话并通知应用；登记的应用                                 |
| `src/db.ts`、`src/adapter.ts`、`src/keys.ts`                         | 数据库、oidc-provider 的存储、签名密钥                         |
| `src/cli.ts`                                                         | 服务器上用的命令                                               |
| `test/`                                                              | OIDC 全流程、页面和管理页的测试；通行密钥用 headless Chrome 测 |
