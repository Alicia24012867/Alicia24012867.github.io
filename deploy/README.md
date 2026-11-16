# 服务器部署

nymphilia.com 和 auth.nymphilia.com 由 VPS（`ssh nyc`）上的 Caddy 提供。每次推送 `main`：

- **网站**：GitHub Actions 构建后，同时发布到这台服务器和 GitHub Pages。GitHub Pages 留作备用：把域名解析改回 GitHub 的地址，就回到 GitHub Pages。
- **登录服务**（`auth/`，见 [auth/README.md](../auth/README.md)）：`auth/` 有改动时，Actions 运行测试、构建镜像并试运行，再交给服务器。新镜像健康才上线，否则自动退回上一版。

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

两个 Caddy 配置由同目录的 `Caddyfile` 引入（`import`）。这些文件改动后不会自动同步，需要手动复制到服务器，再重新加载 Caddy：

```sh
scp deploy/site/deploy deploy/site/receive deploy/site/image deploy/site/activate deploy/site/go-live nyc:/srv/site/bin/
scp deploy/caddy/nymphilia.caddy deploy/caddy/auth.caddy nyc:/srv/proxy/conf/
scp deploy/auth/compose.yml nyc:/srv/auth/
ssh nyc docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

运行 `go-live` 之前，服务器上的两个 Caddy 配置比仓库里多两行测试证书的设置（`tls internal`），这时不要用仓库里的版本覆盖它们。

登录服务的数据库和签名密钥在服务器的 `/srv/auth/data` 里，只有服务器有，不进仓库。

## 切换域名

服务器先用 Caddy 自己签发的测试证书，等域名指过来再换正式证书：

1. 在 Cloudflare 改三处，都保持“仅 DNS”（灰色云朵）：
   - 删掉 `nymphilia.com` 指向 GitHub 的 4 条 A 记录，只留一条指向 `107.170.11.167`；
   - 把 `www` 的 CNAME 改为 `nymphilia.com`；
   - 新增 `auth` 的 A 记录，指向 `107.170.11.167`。
2. 运行 `ssh nyc /srv/site/bin/go-live`。已经指过来的域名换上正式证书，Caddy 在一分钟内取得；还没指过来的，它会说明原因，改好后再运行一次即可。

要切回 GitHub Pages，把网站的两条记录改回原样：4 条 A 记录 `185.199.108.153` 到 `185.199.111.153`，`www` 的 CNAME 指向 `alicia24012867.github.io`。auth.nymphilia.com 只在这台服务器上。

## 网站的发布如何到达服务器

1. Actions 的构建把 `web/dist` 打包成 tar，里面的 `public/` 是公开的网站文件；以后私密文章的 `private/` 也随同一个包发送。
2. 用部署密钥连到服务器。私钥只存在仓库的 Actions secret `VPS_DEPLOY_KEY` 中；服务器的 `~/.ssh/authorized_keys` 用 `restrict,command="/srv/site/bin/deploy"` 限制这把钥匙：只能交付网站发布（`receive`）和服务镜像（`image`），不能登录，也不能做别的事。工作流里写着服务器的主机密钥，不会连到冒充的服务器。
3. `receive` 只接受普通文件和文件夹，路径必须在 `public/` 或 `private/` 里，不能有链接或 `..`；包不能超过 1 GiB，`public/` 必须有 `index.html` 和 `404.html`。
4. 新版本解包到 `/srv/site/public/<时间>-<提交号>/`，再把 `/srv/site/public/current` 指过去。切换是一步完成的：读者要么看到旧版，要么看到新版。`private/` 同理，放在 `/srv/site/private/`，只有所有者可读，不在 Caddy 能看到的目录里。
5. 保留最近 5 次发布，更早的自动删除。

## 服务的镜像如何到达服务器

登录服务（以后还有博客后端 `blog-api`）以 Docker 镜像发布：

1. Actions 运行全部测试，构建镜像 `nymphilia/auth:<提交号>`，再按服务器的方式试运行一次（只读、没有特权、没有网络），确认健康检查通过、配置信息正确。
2. 镜像经 `docker save | gzip` 打包，用同一把部署密钥交给 `image`。它检查：
   - 压缩后不超过 512 MiB，解压后不超过 1 GiB；
   - 只有 `docker save` 会写的文件，没有链接，也没有重名；
   - 镜像只带 `nymphilia/<服务>:<提交号>` 这一个名字。`docker load` 会应用包里的每个名字，多带一个 `caddy:2` 就能替换掉 Caddy 的镜像。
3. 载入后，`activate` 把 `nymphilia/<服务>:live` 指向新镜像，用 `docker compose up --wait` 重启容器，最多等 90 秒，直到健康检查通过。
4. 不健康就自动退回之前的镜像，Actions 的这一步失败。出错信息只说容器的状态，不打印容器日志，因为 Actions 的日志是公开的；要看原因，在服务器上运行 `docker logs auth`。
5. 每个服务保留最新的 3 个镜像，外加在线的那个。

## 回滚

网站：

```sh
ssh nyc /srv/site/bin/activate                         # 列出保留的发布，* 是当前在线的
ssh nyc /srv/site/bin/activate 20261117T040000Z-abcdef123456   # 切回这一次
```

登录服务：

```sh
ssh nyc /srv/site/bin/activate auth                    # 列出保留的镜像，* 是当前在线的
ssh nyc /srv/site/bin/activate auth <40 位提交号>      # 切回这一个；不健康时自动退回
```

下次推送 `main` 时，新的构建会照常上线。

## Caddy 的规则

网站：

- `/assets/` 里的文件名带内容哈希，缓存一年（`immutable`）。
- 页面、`sw.js`、清单、订阅源、sitemap、`robots.txt` 和加密文章的钥匙串（`/locked/`）每次都向服务器确认（`no-cache`），发布后读者立刻看到新版。
- 字体和图片沿用 GitHub Pages 的 10 分钟缓存。
- 未知地址显示网站自己的 `404.html`，状态码保持 404。
- 所有响应带 `Access-Control-Allow-Origin: *` 和 HSTS，与 GitHub Pages 相同；`www.nymphilia.com` 和 `http://` 一步跳转到 `https://nymphilia.com`。
- 支持 zstd 和 gzip 压缩、分段下载（音乐、字体）。

登录服务：

- 所有请求转给容器 `auth` 的 3000 端口，带 HSTS 和压缩；`http://` 跳转到 `https://`。
- 页面的安全头（CSP、禁止被嵌入等）由服务自己设置。登录页用的字体直接从 nymphilia.com 加载。
