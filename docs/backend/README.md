# 用 Rust 写博客后端

博客后端放在仓库的 `server/`，由你自己用 Rust 写，当作平时的练习。它做的事：

- 经 auth.nymphilia.com 登录；
- 私密文章；
- 评论和留言簿；
- 点赞和阅读量；
- Moments；
- 邮件订阅。

前端、登录服务和服务器由 Claude 负责。它们都按 [接口约定](../api/README.md) 准备好了：前端先对着模拟后端开发，你的后端每完成一个功能、通过对应的接口测试，就打开这个功能。

## 怎么合作

- **你写代码。** Claude 不替你写 `server/` 的主要代码，而是讲解概念、给小段示例、审阅你的提交、陪你排查问题。卡住时直接问，例如“这段为什么借用检查不通过”“帮我看看这次提交”。
- **接口测试是验收标准。** `npm --prefix web run api:check -- http://localhost:8080` 全部通过，就说明这个功能做对了（用法见 [接口约定](../api/README.md#用测试用登录服务检查你的后端)）。
- **推送即检查。** 有了 `server/Dockerfile` 之后，每次推送 `server/` 的改动，CI 都会运行：
  1. `cargo test`；
  2. 构建镜像；
  3. 用测试用登录服务和示例私有目录跑一遍接口测试；
  4. 全部通过才部署到服务器。新版本不健康会自动退回上一版。

  所以推送 `main` 不会把坏掉的后端放上线。

- **按自己的节奏。** 每个里程碑都能单独完成、单独上线。下面的指南先写了 R0 和 R1，后面的随你的进度补上。

## 准备工具

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

- VS Code 装 **rust-analyzer** 扩展：补全、跳转、悬停看类型，并在你输入时报错。
- `cargo fmt`：格式化，相当于 clang-format。
- `cargo clippy`：检查常见的不良写法，相当于 clang-tidy。它的建议很值得读，能学到地道的写法。
- `cargo test`：运行测试，测试直接写在源文件里。

## 推荐的库

都可以换，换之前可以先问问取舍。

| 用途        | 库                          | 对应 C/C++ 里的                                     |
| ----------- | --------------------------- | --------------------------------------------------- |
| 异步运行时  | tokio                       | 事件循环（libuv、Boost.Asio）                       |
| Web 框架    | axum                        | 路由和处理函数，类似 Crow、Drogon                   |
| 数据库      | sqlx + SQLite               | 带编译期检查的 SQL，迁移文件                        |
| JSON        | serde、serde_json           | 结构体和 JSON 自动互转，相当于 nlohmann/json 加反射 |
| OIDC 登录   | openidconnect               | 授权码、PKCE、ID token 验证                         |
| 会话        | tower-sessions（或自己写）  | Cookie 和服务端会话表                               |
| 清洗 HTML   | ammonia、pulldown-cmark     | Markdown 转 HTML，去掉危险内容                      |
| 图片        | image、kamadak-exif         | 缩放、转格式；读出 EXIF 方向                        |
| HTTP 客户端 | reqwest（用 rustls）        | 调用发信通道，相当于 libcurl                        |
| 日志        | tracing、tracing-subscriber | 结构化日志                                          |
| 错误处理    | thiserror、anyhow           | 自定义错误类型                                      |

## 里程碑

|             | 你要做的                                                         | 学到什么                                                                             | 验收                                            |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| [R0](R0.md) | 读完 Rust 官方书前 10 章，做完 Rustlings                         | 所有权和借用（对照 RAII 和移动语义）、`Result` / `Option`、trait（对照模板和虚函数） | Rustlings 全部通过；一个读清单的小程序          |
| [R1](R1.md) | 写出 `/api/health`，配好 Dockerfile，第一次自动部署              | cargo、axum 的路由、多阶段构建                                                       | `https://nymphilia.com/api/health` 回答你的版本 |
| R2          | 用 SQLite 建表，写好迁移                                         | async 和 tokio、sqlx、错误处理                                                       | 自己写的测试                                    |
| R3          | 接入 auth.nymphilia.com 登录，管理会话，按分组判断权限，处理停用 | OIDC 授权码 + PKCE、Cookie 安全、中间件                                              | 接口测试 `auth`                                 |
| R4          | 私密文章和照片接口                                               | 读取清单、按等级授权、安全地读文件                                                   | 接口测试 `private`                              |
| R5          | 评论和留言簿：回复、审核、防垃圾                                 | 输入校验、HTML 清洗、频率限制                                                        | 接口测试 `comments`                             |
| R6          | 点赞和阅读量                                                     | 匿名去重、并发计数、事务                                                             | 接口测试 `stats`                                |
| R7          | Moments：上传、缩放、去掉位置信息                                | multipart、图片处理、文件存储                                                        | 接口测试 `moments`                              |
| R8          | 订阅：确认、退订、群发                                           | 邮件流程、令牌、后台任务                                                             | 接口测试 `subscriptions`                        |

R2 之后，每完成一个里程碑，就把功能名加进 `/api/health` 的 `features`，接口测试才会检查它；CI 通过、部署上线后，告诉 Claude 打开前端对应的开关。

## 后端的环境

配置全部来自环境变量，见 [接口约定 · 后端的配置](../api/README.md#后端的配置)。服务器上的容器：

- 只读的文件系统，只能写 `/data`（数据库、照片）和 `/tmp`；
- 以 uid 1000 运行，没有任何特权；
- 内存上限 128 MB，一般用不到 20 MB；
- 和 Caddy 在同一个 Docker 网络里，外面只能经 `https://nymphilia.com/api/` 访问到它。
