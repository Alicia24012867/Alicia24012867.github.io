# 服务器部署

nymphilia.com 由 VPS（`ssh nyc`）上的 Caddy 提供。每次推送 `main`，GitHub Actions 构建网站后，同时发布到这台服务器和 GitHub Pages。GitHub Pages 留作备用：把域名解析改回 GitHub 的地址，就回到 GitHub Pages。

## 文件对应

| 仓库里                         | 服务器上                          | 作用                                             |
| ------------------------------ | --------------------------------- | ------------------------------------------------ |
| `deploy/site/receive`          | `/srv/site/bin/receive`           | 接收一次发布，解包后切换为在线版本               |
| `deploy/site/activate`         | `/srv/site/bin/activate`          | 列出保留的发布，或切回其中一个                   |
| `deploy/site/go-live`          | `/srv/site/bin/go-live`           | 域名指向服务器后运行一次，换上正式证书           |
| `deploy/caddy/nymphilia.caddy` | `/srv/proxy/conf/nymphilia.caddy` | 网站的 Caddy 配置，由同目录的 Caddyfile `import` |

这些文件改动后不会自动同步，需要手动复制到服务器，再重新加载 Caddy：

```sh
scp deploy/site/receive deploy/site/activate nyc:/srv/site/bin/
scp deploy/caddy/nymphilia.caddy nyc:/srv/proxy/conf/
ssh nyc docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## 切换域名

服务器先用 Caddy 自己签发的测试证书，等域名指过来再换正式证书：

1. 在 Cloudflare 删掉 `nymphilia.com` 指向 GitHub 的 4 条 A 记录，只留一条指向 `107.170.11.167`；把 `www` 的 CNAME 改为 `nymphilia.com`。两条都保持“仅 DNS”（灰色云朵）。
2. 运行 `ssh nyc /srv/site/bin/go-live`。DNS 还没改好时它会说明原因并退出；改好后 Caddy 在一分钟内取得 `nymphilia.com` 和 `www.nymphilia.com` 的正式证书。

要切回 GitHub Pages，把两条记录改回原样：4 条 A 记录 `185.199.108.153` 到 `185.199.111.153`，`www` 的 CNAME 指向 `alicia24012867.github.io`。

## 发布如何到达服务器

1. Actions 的构建把 `web/dist` 打包成 tar，里面的 `public/` 是公开的网站文件；以后私密文章的 `private/` 也随同一个包发送。
2. 用部署密钥连到服务器。私钥只存在仓库的 Actions secret `VPS_DEPLOY_KEY` 中；服务器的 `~/.ssh/authorized_keys` 用 `restrict,command="/srv/site/bin/receive"` 限制这把钥匙只能交付发布，不能登录或做别的事。工作流里写着服务器的主机密钥，不会连到冒充的服务器。
3. `receive` 只接受普通文件和文件夹，路径必须在 `public/` 或 `private/` 里，不能有链接或 `..`；包不能超过 1 GiB，`public/` 必须有 `index.html` 和 `404.html`。
4. 新版本解包到 `/srv/site/public/<时间>-<提交号>/`，再把 `/srv/site/public/current` 指过去。切换是一步完成的：读者要么看到旧版，要么看到新版。`private/` 同理，放在 `/srv/site/private/`，只有所有者可读，不在 Caddy 能看到的目录里。
5. 保留最近 5 次发布，更早的自动删除。

## 回滚

```sh
ssh nyc /srv/site/bin/activate                         # 列出保留的发布，* 是当前在线的
ssh nyc /srv/site/bin/activate 20261117T040000Z-abcdef123456   # 切回这一次
```

下次推送 `main` 时，新的构建会照常上线。

## Caddy 的规则

- `/assets/` 里的文件名带内容哈希，缓存一年（`immutable`）。
- 页面、`sw.js`、清单、订阅源、sitemap、`robots.txt` 和加密文章的钥匙串（`/locked/`）每次都向服务器确认（`no-cache`），发布后读者立刻看到新版。
- 字体和图片沿用 GitHub Pages 的 10 分钟缓存。
- 未知地址显示网站自己的 `404.html`，状态码保持 404。
- 所有响应带 `Access-Control-Allow-Origin: *` 和 HSTS，与 GitHub Pages 相同；`www.nymphilia.com` 和 `http://` 一步跳转到 `https://nymphilia.com`。
- 支持 zstd 和 gzip 压缩、分段下载（音乐、字体）。
