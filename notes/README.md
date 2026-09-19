# Notes / Knowledge Base

Blog 用于完整文章；Notes 是按主题维护、持续修订的个人 Wiki。

在 `notes/content/` 下添加 Markdown 或 HTML 文件：

- `formulas/`：公式
- `source/`：源码阅读
- `cuda/`：CUDA API
- `spice/`：SPICE 算法
- 其他目录或根目录中的笔记归入「其他笔记」。

文件路径决定地址，例如 `cuda/api-template.md` 对应 `/notes/?post=cuda%2Fapi-template`。主题按目录确定，不需要设置 Blog 的 `section` 字段。

```yaml
---
title: 我的笔记
date: 2026-09-20
description: 一句话说明查阅用途
tags: [CUDA, 内存]
draft: false
---
```

`date` 可省略；填写时表示最近修订日期，需要手动维护。`draft: true` 排除发布。

支持数学公式、代码高亮和复制、目录、Mermaid、图片及附件，语法沿用 [文章撰写说明](../articles/README.md)。附件放在 `notes/content/` 内，使用相对路径引用。

通过 `[相关笔记](../formulas/taylor.md)` 链接另一篇笔记，支持标题锚点。构建会校验链接目标，阅读页会自动列出引用当前笔记的其他笔记。跨 Blog 链接使用站点路径，例如 `/blog/?post=test`。

索引支持标题、摘要、标签及正文搜索，关键词保存在 URL 中；点击标签可直接搜索。示例公式与三个模板均明确标注，可按需替换或删除；删除时也需移除指向它的链接。
