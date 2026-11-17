# 服务器部署

nymphilia.com 和 auth.nymphilia.com 由 VPS（`ssh nyc`）上的 Caddy 提供。每次推送 `main`：

- **网站**：GitHub Actions 构建后，同时发布到这台服务器和 GitHub Pages。GitHub Pages 留作备用：把域名解析改回 GitHub 的地址，就回到 GitHub Pages。
- **登录服务**（`auth/`，见 [auth/README.md](../auth/README.md)）：`auth/` 有改动时，Actions 运行测试、构建镜像并试运行，再交给服务器。新镜像健康才上线，否则自动退回上一版。
- **博客后端**（`server/`，用 Rust 写，见 [docs/backend/](../docs/backend/README.md)）：有 `server/Dockerfile` 之后，`server/` 有改动时，Actions 运行 `cargo test`、构建镜像，再用接口测试（[docs/api/](../docs/api/README.md)）检查镜像，全部通过才交给服务器，上线方式与登录服务相同。Caddy 把 `nymphilia.com/api/` 下的请求都转给它。

## 文件对应

| 仓库里                         | 服务器上                          | 作用                                                  |
| ------------------------------ | --------------------------------- | ----------------------------------------------------- |
| `deploy/site/deploy`           | `/srv/site/bin/deploy`            | 部署密钥唯一能运行的命令，只转交 `receive` 和 `image` |
| `deploy/site/receive`          | `/srv/site/bin/receive`           | 接收一次网站发布，解包后切换为在线版本                |
| `deploy/site/image`            | `/srv/site/bin/image`             | 接收一个服务的镜像，检查、载入后交给 `activate`       |
| `deploy/site/activate`         | `/srv/site/bin/activate`          | 列出保留的网站发布或服务镜像，或切换到其中一个        |
| `deploy/site/go-live`          | `/srv/site/bin/go-live`           | 域名指向服务器后运行，换上正式证书                    |
| `deploy/caddy/nymphilia.caddy` | `/srv/proxy/conf/nymphilia.caddy` | 网站的 Caddy 配置                                     |
| `deploy/caddy/auth.caddy`      | `/srv/proxy/conf/auth.caddy`      | 登录服务的 Caddy 配置                                 |
| `deploy/auth/compose.yml`      | `/srv/auth/compose.yml`           | 登录服务的容器                                        |
| `deploy/site/compose.yml`      | `/srv/site/compose.yml`           | 博客后端的容器 `blog-api`                             |

两个 Caddy 配置由同目录的 `Caddyfile` 引入（`import`）。这些文件改动后不会自动同步，需要手动复制到服务器，再重新加载 Caddy：

```sh
scp deploy/site/deploy deploy/site/receive deploy/site/image deploy/site/activate deploy/site/go-live nyc:/srv/site/bin/
scp deploy/caddy/nymphilia.caddy deploy/caddy/auth.caddy nyc:/srv/proxy/conf/
scp deploy/auth/compose.yml nyc:/srv/auth/
scp deploy/site/compose.yml nyc:/srv/site/
ssh nyc docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

运行 `go-live` 之前，服务器上的两个 Caddy 配置比仓库里多两行测试证书的设置（`tls internal`），这时不要用仓库里的版本覆盖它们。

登录服务的数据库和签名密钥在服务器的 `/srv/auth/data` 里，只有服务器有，不进仓库。博客后端也一样：数据库在 `/srv/site/api/data`，客户端密钥和发信密钥在 `/srv/site/api/.env`（见 `deploy/site/compose.yml` 开头的说明），两处都只有所有者可读。

## 切换域名

服务器先用 Caddy 自己签发的测试证书，等域名指过来再换正式证书：

1. 在 Cloudflare 改三处，都保持“仅 DNS”（灰色云朵）：
   - 删掉 `nymphilia.com` 指向 GitHub 的 4 条 A 记录，只留一条指向 `107.170.11.167`；
   - 把 `www` 的 CNAME 改为 `nymphilia.com`；
   - 新增 `auth` 的 A 记录，指向 `107.170.11.167`。
2. 运行 `ssh nyc /srv/site/bin/go-live`。已经指过来的域名换上正式证书，Caddy 在一分钟内取得；还没指过来的，它会说明原因，改好后再运行一次即可。

要切回 GitHub Pages，把网站的两条记录改回原样：4 条 A 记录 `185.199.108.153` 到 `185.199.111.153`，`www` 的 CNAME 指向 `alicia24012867.github.io`。auth.nymphilia.com 只在这台服务器上。

## 网站的发布如何到达服务器

1. Actions 的构建把 `web/dist` 和 `web/dist-private` 打包成一个 tar：`public/` 是公开的网站文件，`private/` 是私密文章的明文和附件，只给博客后端读（格式见 [docs/api/README.md](../docs/api/README.md#私有目录)）。工作流不列出包里的文件名，因为 Actions 的日志是公开的。
2. 用部署密钥连到服务器。私钥只存在仓库的 Actions secret `VPS_DEPLOY_KEY` 中；服务器的 `~/.ssh/authorized_keys` 用 `restrict,command="/srv/site/bin/deploy"` 限制这把钥匙：只能交付网站发布（`receive`）和服务镜像（`image`），不能登录，也不能做别的事。工作流里写着服务器的主机密钥，不会连到冒充的服务器。
3. `receive` 只接受普通文件和文件夹，路径必须在 `public/` 或 `private/` 里，不能有链接或 `..`；包不能超过 1 GiB，`public/` 必须有 `index.html` 和 `404.html`。
4. 新版本解包到 `/srv/site/public/<时间>-<提交号>/`，再把 `/srv/site/public/current` 指过去。切换是一步完成的：读者要么看到旧版，要么看到新版。`private/` 同理，放在 `/srv/site/private/`，只有所有者可读，不在 Caddy 能看到的目录里；它先于 `public/` 切换，新页面上线时，它要的私密文章已经在了。`blog-api` 以只读方式看到 `/srv/site/private`，读 `/private/current`。
5. 保留最近 5 次发布，更早的自动删除。

## 服务的镜像如何到达服务器

登录服务和博客后端 `blog-api` 都以 Docker 镜像发布：

1. Actions 运行全部测试，构建镜像 `nymphilia/<服务>:<提交号>`，再按服务器的方式试运行一次（只读、没有特权），确认健康检查通过。登录服务还要确认配置信息正确；博客后端还要和测试用登录服务一起跑完接口测试。
2. 镜像经 `docker save | gzip` 打包，用同一把部署密钥交给 `image`。它检查：
   - 压缩后不超过 512 MiB，解压后不超过 1 GiB；
   - 只有 `docker save` 会写的文件，没有链接，也没有重名；
   - 镜像只带 `nymphilia/<服务>:<提交号>` 这一个名字。`docker load` 会应用包里的每个名字，多带一个 `caddy:2` 就能替换掉 Caddy 的镜像。
3. 载入后，`activate` 先确认镜像有健康检查（Dockerfile 里的 `HEALTHCHECK`），没有就拒绝：没有它，容器一运行就算成功，启动一秒后崩溃也发现不了。然后把 `nymphilia/<服务>:live` 指向新镜像，用 `docker compose up --wait` 重启容器，最多等 90 秒，直到健康检查通过。
4. 不健康就自动退回之前的镜像，Actions 的这一步失败。出错信息只说容器的状态，不打印容器日志，因为 Actions 的日志是公开的；要看原因，在服务器上运行 `docker logs auth` 或 `docker logs blog-api`。
5. 每个服务保留最新的 3 个镜像，外加在线的那个。

## 回滚

网站：

```sh
ssh nyc /srv/site/bin/activate                         # 列出保留的发布，* 是当前在线的
ssh nyc /srv/site/bin/activate 20261117T040000Z-abcdef123456   # 切回这一次
```

登录服务和博客后端（把 `auth` 换成 `blog-api`）：

```sh
ssh nyc /srv/site/bin/activate auth                    # 列出保留的镜像，* 是当前在线的
ssh nyc /srv/site/bin/activate auth <40 位提交号>      # 切回这一个；不健康时自动退回
```

2026-11-17 用一个最小的 busybox 镜像演练过博客后端的整个流程：交付后上线并经 Caddy 回答 `/api/health`；没有健康检查的镜像被拒绝；启动后不健康的镜像自动退回上一版。演练用的镜像和容器之后都删除了。

下次推送 `main` 时，新的构建会照常上线。

## Caddy 的规则

网站：

- `/assets/` 里的文件名带内容哈希，缓存一年（`immutable`）。
- 页面、`sw.js`、清单、订阅源、sitemap、`robots.txt` 和加密文章的钥匙串（`/locked/`）每次都向服务器确认（`no-cache`），发布后读者立刻看到新版。
- 字体和图片沿用 GitHub Pages 的 10 分钟缓存。
- 未知地址显示网站自己的 `404.html`，状态码保持 404。
- 所有响应带 HSTS；页面和文件还带 `Access-Control-Allow-Origin: *`，与 GitHub Pages 相同。`www.nymphilia.com` 和 `http://` 一步跳转到 `https://nymphilia.com`。
- `/api/` 下的请求都转给容器 `blog-api` 的 8080 端口。它的回答不带 `Access-Control-Allow-Origin`（只给本站的页面用），缓存规则由后端自己定。后端没在运行时，回答 503 和一段 JSON 错误，与接口约定里的错误格式相同。
- 支持 zstd 和 gzip 压缩、分段下载（音乐、字体）。

登录服务：

- 所有请求转给容器 `auth` 的 3000 端口，带 HSTS 和压缩；`http://` 跳转到 `https://`。
- 页面的安全头（CSP、禁止被嵌入等）由服务自己设置。登录页用的字体直接从 nymphilia.com 加载。
