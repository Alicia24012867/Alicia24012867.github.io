# Notes / Knowledge Base

Blog 用于完整文章；Notes 是按主题维护、持续修订的个人 Wiki。

在 `content/notes/` 下添加 Markdown 或 HTML 文件：

- `formulas/`：公式
- `source/`：源码阅读
- `cuda/`：CUDA API
- `spice/`：SPICE 算法
- 其他目录或根目录中的笔记归入「其他笔记」。

文件路径决定地址，例如 `cuda/api-template.md` 对应 `/notes/?post=cuda%2Fapi-template`。主题按目录确定，不需要设置 Blog 的 `section` 字段。

```yaml
---
title: 我的笔记
author: Alicia
email: alicia@example.com
date: 2026-09-20
description: 一句话说明查阅用途
tags: [CUDA, 内存]
draft: false
---
```

`date` 表示首次发布时间，`updated` 可指定最近编辑时间；两者省略时从 Git 历史自动取得。所有主题的列表和阅读页显示 `Posted on`，有后续编辑时显示 `Edited on`，同日编辑也会显示。发布时间不随修订改变；具体规则和无 Git 历史时的回退见[时间戳说明](writing.md#发布时间与编辑时间)。`draft: true` 排除发布。

`author` 和 `email` 可选，列表和阅读页会显示填写的字段，邮箱可点击；未填写的字段自动隐藏。

支持数学公式、代码高亮和复制、目录、Mermaid、图片及附件，语法沿用 [文章撰写说明](writing.md)。附件放在 `content/notes/` 内，使用相对路径引用。

通过 `[相关笔记](../formulas/taylor.md)` 链接另一篇笔记，支持标题锚点。构建会校验链接目标，阅读页会自动列出引用当前笔记的其他笔记。跨 Blog 链接使用站点路径，例如 `/blog/?post=test`。

索引支持标题、摘要、标签及正文搜索，关键词保存在 URL 中；点击标签可直接搜索。示例公式与三个模板均明确标注，可按需替换或删除；删除时也需移除指向它的链接。
