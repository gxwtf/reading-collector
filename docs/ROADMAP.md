# 改进路线（对标同类项目）

调研对象（2026-11，Star 数为当时）：

| 项目 | Star | 定位 |
| --- | --- | --- |
| [karakeep](https://github.com/karakeep-app/karakeep) | 30.4k | 书签一切（链接/笔记/图片）+ AI 打标 + 语义搜索 |
| [linkwarden](https://github.com/linkwarden/linkwarden) | 20.3k | 协作书签 + 阅读视图 + 高亮 + 归档 |
| [wallabag](https://github.com/wallabag/wallabag) | 13.1k | 经典稍后读 |
| [ArchiveBox](https://github.com/ArchiveBox/ArchiveBox) | 29.0k | 网页归档（快照） |
| [memos](https://github.com/usememos/memos) | 64.3k | 轻量笔记流 |

## 我们已有

链接收藏（单条/批量/API）、B 站收藏夹与合集、RSS 订阅、Markdown 导入、
正文抽取（trafilatura）、PDF（pypdf）、音视频转写（whisper.cpp / B 站字幕）、
AI 概括（多 key 轮换 + BYOK）、划线批注与批注页、视频关键帧、
精确播放（本地 mp4 + HLS）、逐行字幕跟随、分组/标签、批量操作、导出 md/json。

## 差距

| 能力 | karakeep | linkwarden | 我们 | 价值 |
| --- | --- | --- | --- | --- |
| 全文检索 | Meilisearch | 全文搜索 | **ILIKE 模糊匹配** | 高 |
| 语义检索 | ✅ embedding | — | ❌ | 高 |
| 自动打标 | ✅ LLM | ✅ 本地 AI | ❌（只有摘要） | 高 |
| 浏览器扩展 / 分享 | 三端扩展 + App | 扩展 | ❌（只有 API） | 高 |
| PWA / 离线 | ✅ | — | ❌ | 中 |
| 全文快照（防失效） | ✅ monolith | ✅ Wayback | ❌（只存正文 md） | 中 |
| 公共分享页 | 列表协作 | ✅ | ❌ | 中 |
| AI 问答（RAG） | — | — | ❌ | 中 |
| 标签管理 UI（改名/合并/配色） | ✅ | ✅ | 部分（仅建/删） | 中 |
| OPML 导入 | ✅ | ✅ | ❌ | 低 |
| 阅读统计/回顾 | — | — | ❌ | 低 |
| 图片 OCR | ✅ | — | ❌ | 低 |
| TTS 朗读 | — | — | ❌ | 低 |

## 下一步建议（按「价值 ÷ 成本」排序）

### 1. 全文检索换成 Postgres FTS（1 天）

现状 ILIKE 只能整词包含，文章一多就慢且不准。改法：
`tsvector` 生成列 + GIN 索引；中文用 `zhparser` 或退而求其次 `pg_trgm` 三元组。
搜索框支持多词 AND、命中片段高亮。

### 2. AI 自动打标（半天）

已有 LLM 多 key 与任务队列：转写/抓取完成后跑一次 `tagging` 任务，
提示词限定「从既有标签里选，不够再新建，最多 3 个」，写入 `EntryTag`。
标签页可批量确认/撤销。

### 3. 语义检索（1–2 天）

`pgvector` + 摘要向量（每篇一次 embedding，成本极低）。
入口：「找找我看过关于 X 的内容」，结果按相似度排序，可与关键词检索混排。

### 4. PWA + iOS 分享捷径（半天）

- manifest + service worker，只缓存静态资源
- 提供 `POST /api/v1/entries` 的快捷指令模板（已在 API 文档里）
- Safari 分享 → 捷径 → 入库，一步完成

### 5. 公共分享页（1 天）

`/s/<token>`：只读渲染一篇（或一个分组），可选「隐藏划线」。
适合把语料发给同学看，不用给账号。

### 6. 全文快照（1 天）

抓取时额外存一份 `monolith` 单文件 HTML（或 Readability HTML），
原站挂了还能回看；体积比截图小得多。

### 7. 标签管理 / OPML / 统计（各半天）

- 标签管理页：改名、合并、删除、配色
- OPML 导入：一次把所有订阅迁进来
- 统计：本周收藏/读完数、连续天数、最常读的站点

## 不建议做

- **原生 App**：维护成本高，PWA + 捷径覆盖 90% 场景
- **多人协作**：当前是个人阅读库，协作模型会拖慢一切
- **自己训练模型**：现有 API 足够，训练与推理成本不成比例
