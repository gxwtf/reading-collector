# 设计说明

## 要解决的问题

收藏夹是知识的坟墓。

看到好东西 → 存进稍后读 / 收藏 /  clipboard → 再也没打开过。
问题不在「存」，在于**存下来之后没有任何推动力让内容变成可检索的东西**。

这个项目把「稍后读」换成**待办**：待办有完成状态，完成状态有心理压力。
处理完就消失，库才不会烂。

## 三个设计决策

### 1. 待办当收件箱，Obsidian 当权威库

| 位置 | 职责 | 生命周期 |
|---|---|---|
| 待办分组 | 还没处理的东西 | 处理完即消失 |
| Obsidian | 已整理的知识 | 长期保留、可检索 |
| Notion | 网页端只读镜像 | 从属，随时可重建 |

待办是**队列**不是**仓库**。这一条决定了整个系统的形态——队列会清空，
所以不会像收藏夹一样无限膨胀。

### 2. 先落盘，再勾完成

```
抓正文 → 写 Obsidian → 重建索引 → 勾完成 → 镜像 Notion
```

顺序不能反。写笔记失败就留着待办，下次重试。
反过来（先勾后写）一旦写失败，内容就永久丢失，而且你不知道丢了什么。

同理，Notion 在最后：它是从属步骤，失败只记一笔，不回滚、不重试。
**主流程的成功不依赖从属步骤。**

### 3. 视频转写本地跑

现成的方案要么按次计费，要么要登录，要么有额度。
本地转写的代价只是慢（45 分钟视频约 2 分钟），换来的是**无限制**。

转写不是目的，只是把「不能检索的音频」变成「能检索的文本」。
笔记仍然由 agent 写——逐字稿是原料，不是成品。

## 数据契约

### 待办条目

```
标题 = 题目（人类可读）
正文 = 链接（可多个）
```

青蛙todo 的正文是 Quill Delta 富文本，链接藏在 `attributes.link` 里：

```json
[{"insert":"https://mp.weixin.qq.com/s/xxx","attributes":{"link":"https://mp.weixin.qq.com/s/xxx"}}]
```

直接正则抓正文容易漏（被截断的省略号链接、带 tracking 参数的链接），
所以要同时读 `attributes.link`。

### 笔记文件

```markdown
---
title: "标题"
source: "微信公众号"
author: "作者"
url: "https://…"
collected: "2026-11-01"
tags:
  - 阅读收集
  - 公众号
---

> [!info] 来源
> 微信公众号　·　[原文](https://…)　·　作者

正文…
```

front-matter 是机器读的（去重、索引重建），callout 是人读的。
两者不能省：去重靠 `url` 字段精确匹配，索引靠 `title` / `collected` 重建。

### 逐字稿

```json
{
  "title": "…", "uploader": "…", "duration": 2717,
  "locale": "en-US", "backend": "apple",
  "chapters": [{"t": 0, "title": "开场"}],
  "transcript": ["[00:00] …", "[00:45] …"]
}
```

`transcript` 每行对齐一个切片，时间戳是切片起点。
配合 `chapters` 就能把逐字稿切回章节结构。

## 为什么不用字幕

看起来字幕比转写省事，实际上不可靠：

- B 站 `x/player/v2` 和 `x/player/wbi/v2` **都要登录**才返回字幕列表，未登录返回空数组
- 不是所有视频都有字幕（讲座、播客、直播回放通常没有）
- 自动字幕的质量不稳定

走音频转写是唯一对所有平台都成立的路径。
代价是慢，但结果一致。

## 扩展点

### 换一个待办后端

`scripts/inbox.py` 里按 backend 分派：

```python
items = backend_frogtodo() if backend == "frogtodo" else backend_file(inbox_path)
```

加一个 `backend_todoist()` 之类，返回同样的结构即可：

```python
{"id": str, "title": str, "text": str, "urls": [str], "raw": dict}
```

### 换一个语音识别后端

`scripts/transcribe.py` 里的 `BACKENDS` 字典：

```python
BACKENDS = {"apple": asr_apple, "whisper": asr_whisper}
```

新后端只要实现 `fn(path: Path, locale: str, tries: int) -> str | None`。
返回值是纯文本，超时/失败返回 `None`，不要抛异常。

### 换一个归档目标

`scripts/archive.py` 的 `write_note()` 只做一件事：把字符串写到路径。
想改成 Joplin / Logseq / 纯文件系统，替换掉这两个函数就行：

- `note_path(title, date, url) -> Path`
- `build_note(...) -> str`

## 已知限制

| 限制 | 原因 | 缓解 |
|---|---|---|
| 识别语言必须与原声一致 | 语音识别模型按语言训练 | 文档强调；`auto` 按标题猜 |
| 识别不能并发 | 系统识别服务会限流 | 串行 + 间隔 + 重试 |
| ctranslate2 不支持 musl | 只发布 glibc wheel | musl 用 apple 后端 |
| 公众号验证墙 | 反爬 | 浏览器渲染兜底 |
| 长视频慢 | 串行识别 | 45s 切片，后台跑 |

## 数据流总览

```
待办应用          脚本                 本地文件系统
   │                │                       │
   ├─ 读待办 ──────► inbox.py ──────────────┘
   │                │
   │                ├─ 视频 ──► transcribe.py ──► transcript.json
   │                │              │
   │                └─ 文章 ──► 抓取 ──► body.md
   │                              │
   └─ 勾完成 ◄──── archive.py ◄───┘
                        │
                        ├─► Obsidian 笔记
                        ├─► 首页索引
                        └─► Notion 镜像（可选）
```
