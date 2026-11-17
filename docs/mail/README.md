# 发信通道

VPS 不能直接发信：25、465、587 端口都被封了。nymphilia.com 的邮箱在 Google Workspace 上，所以由一个 Apps Script 代发：服务器经 HTTPS 把邮件交给它，它用 Gmail 发出。SPF 和 DKIM 都是 Google 现成的，不用另外配置。

博客后端（订阅确认、群发）和登录服务（以后的邮箱验证码）共用这个通道。脚本是 [`relay.gs`](relay.gs)。

## 设置（只需一次）

1. 生成一个密钥，记下来：

   ```bash
   openssl rand -base64 32
   ```

2. 用 nymphilia.com 的 Workspace 账号打开 https://script.google.com ，新建项目，命名为 `nymphilia mail relay`。把 `relay.gs` 的全部内容粘贴进 `Code.gs`，替换原有内容，保存。
3. 左侧 **Project Settings**（齿轮）→ **Script Properties** → **Add script property**：名称 `RELAY_KEY`，值是第 1 步的密钥。
4. 右上角 **Deploy → New deployment**，类型选 **Web app**：
   - **Execute as**：Me（你自己的账号，邮件从这里发出）
   - **Who has access**：Anyone（请求靠密钥验证，不靠 Google 登录）

   按提示授权“代你发送邮件”，然后复制 **Web app URL**（以 `/exec` 结尾）。

5. 把地址和密钥写进服务器的 `/srv/site/api/.env`：

   ```sh
   BLOG_MAIL_URL=https://script.google.com/macros/s/…/exec
   BLOG_MAIL_KEY=第 1 步的密钥
   ```

   然后运行 `ssh nyc docker compose -f /srv/site/compose.yml up -d blog-api`，让后端读到新的配置。

以后修改脚本时，要用 **Deploy → Manage deployments → 编辑 → Version: New version** 发布，地址保持不变。

## 怎么调用

```http
POST <BLOG_MAIL_URL>
Content-Type: application/json

{
  "key": "<BLOG_MAIL_KEY>",
  "to": "reader@example.com",
  "subject": "Please confirm your subscription",
  "text": "纯文本正文",
  "html": "<p>HTML 正文（可选）</p>",
  "replyTo": "回复地址（可选）",
  "name": "发件人显示名（可选，默认 nymphilia.com）"
}
```

- Google 先回答 **302**，跳到 `script.googleusercontent.com`。要**跟随跳转，并且改用 GET**，才能读到结果。Rust 的 reqwest 默认就这样做。
- 结果总是 200，内容是 JSON：
  - 成功：`{"ok": true, "remaining": 1499}`
  - 失败：`{"ok": false, "error": "wrong_key", "remaining": 1500}`
- `remaining` 是今天还能发的封数。Workspace 账号每天大约 1500 封，按收件人计算；用完回答 `quota_used_up`。
- 其他 `error`：`not_json`、`no_key_set`（没设置 `RELAY_KEY`）、`bad_to`、`bad_subject`、`bad_text`、`bad_html`、`bad_reply_to`、`bad_name`、`send_failed`。
- 一次只发给一个收件人。群发时逐个调用，失败的记下来，不要立刻重试很多次。

## 安全

- 密钥只放在 Script Properties 和服务器的 `.env` 里，不进仓库，也不要写进日志。
- 脚本用固定时间的比较检查密钥，再检查每个字段。
- 怀疑密钥泄露时，生成一个新的，同时替换 Script Properties 和 `.env`，旧的立刻失效。
- 邮件从你的账号发出，会出现在 Gmail 的“已发送”里。
- 可选：在 Cloudflare 加一条 DMARC 记录（`_dmarc` 的 TXT 记录，例如 `v=DMARC1; p=none; rua=mailto:<你的邮箱>`），让收件方更信任这些邮件。
