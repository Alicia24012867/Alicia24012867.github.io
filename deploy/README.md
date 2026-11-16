# 服务器部署

nymphilia.com 由 VPS（`ssh nyc`）上的 Caddy 提供。每次推送 `main`，GitHub Actions 构建网站后，同时发布到这台服务器和 GitHub Pages。GitHub Pages 留作备用：把域名解析改回 GitHub 的地址，就回到 GitHub Pages。

## 文件对应

| 仓库里                         | 服务器上                          | 作用                                             |
| ------------------------------ | --------------------------------- | ------------------------------------------------ |
| `deploy/site/receive`          | `/srv/site/bin/receive`           | 接收一次发布，解包后切换为在线版本               |
| `deploy/site/activate`         | `/srv/site/bin/activate`          | 列出保留的发布，或切回其中一个                   |
| `deploy/caddy/nymphilia.caddy` | `/srv/proxy/conf/nymphilia.caddy` | 网站的 Caddy 配置，由同目录的 Caddyfile `import` |

这些文件改动后不会自动同步，需要手动复制到服务器，再重新加载 Caddy：

```sh
scp deploy/site/receive deploy/site/activate nyc:/srv/site/bin/
scp deploy/caddy/nymphilia.caddy nyc:/srv/proxy/conf/
ssh nyc docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

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
