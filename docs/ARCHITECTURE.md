# 架构说明

阅读收集（云端版）把原来「待办 → 抓正文 → Obsidian 归档」的本地流水线搬到了服务器：
内容存在 PostgreSQL，浏览与整理在 Web 页面完成，不再依赖 Obsidian、Notion 或任何本机文件。

## 一张图

```
                  ┌─────────────────────────────┐
  浏览器  ───────► │  Next.js 16（App Router）    │
                  │  · Server Actions 处理增删改   │
                  │  · iron-session + 广学账号 SSO│
                  └──────┬───────────────┬──────┘
                         │ Prisma 7      │ HTTP + Bearer
                         ▼               ▼
                  ┌─────────────┐  ┌────────────────────┐
                  │ PostgreSQL  │◄─│ Python worker       │
                  │ gxwtf_reading│  │ 抓正文 / 音视频转写  │
                  └─────────────┘  └────────────────────┘
```

- **站点不干重活。** 收藏动作只做两件事：写 `Entry`（`state=pending`）+ 投一条 `FetchJob`，随即返回。
- **worker 不连数据库。** 它只通过 `GET /api/worker/jobs` 领任务、`POST /api/worker/jobs/<id>` 回填结果，
  接口用 `INTERNAL_API_KEY` 保护。这样 worker 可以单独重启、单独扩容，也便于以后放到另一台机器。
- **任务领取是原子的。** 用 `FOR UPDATE SKIP LOCKED` 选出最早的一条 pending，多个 worker 不会撞车。

## 任务协议

| 方向 | 接口 | 说明 |
| --- | --- | --- |
| 建任务 | Server Action `createEntry` | 同一用户同一 URL 幂等；已抓过的不重复投递 |
| 领取 | `GET /api/worker/jobs?worker=<名字>` | 返回 `{ job: { id, entryId, url, kind } }`，无任务返回 `{ job: null }` |
| 回填 | `POST /api/worker/jobs/<id>` | `{ status: "done", entry: {...}, transcript?: {...} }` 或 `{ status: "failed", error }` |

`kind` 取值：

- `fetch` —— 文章正文（httpx + trafilatura 抽正文并转 Markdown）
- `transcribe` —— 音视频（yt-dlp 取音轨 → ffmpeg 转 16k wav → whisper.cpp 转写）

失败会把 `Entry.state` 置为 `failed` 并记录原因，页面上给「重试」按钮（重新投递一条任务）。

## 数据模型要点

| 表 | 作用 | 关键约束 |
| --- | --- | --- |
| `User` | 从 SSO 同步的用户镜像 | `userId`（广学账号 ID）唯一，业务表都指向它 |
| `Entry` | 一条收藏 | `@@unique([userId, url])` 保证幂等；`state` 管抓取状态，`readState` 管阅读进度 |
| `Collection` / `CollectionEntry` | 分组（待读 / 素材 / 外刊…） | 用户级命名唯一，与条目多对多 |
| `Tag` / `EntryTag` / `TagConfig` | 标签与用户级配色 | 与「作文积累本」同构，标签名全局去重 |
| `Transcript` | 音视频逐字稿 | 一条收藏至多一份，保留分段与识别后端 |
| `Highlight` | 划线批注 | 记录 `anchor`，便于将来在正文回显 |
| `FetchJob` | 抓取/转写队列 | `status` + `createdAt` 索引支撑轮询 |

`state` 与 `readState` 分开的原因：抓取失败不代表没读过，
「已读但没抓到正文」是一种真实状态，混在一个字段里会互相覆盖。

## 与原 Obsidian 版本的关系

| 原实现 | 现在 |
| --- | --- |
| 待办 App 当收件箱 | Web 页面直接收藏（后续可加书签脚本 / 分享扩展） |
| Obsidian 当权威库，Markdown 文件 | PostgreSQL `Entry.contentMd`，页面用 MDX 渲染 |
| Notion 从属镜像 | 去掉了：同一份数据在站内就能看，不再需要第二份副本 |
| 本地 `transcribe.py`（apple-speech / faster-whisper） | worker 里的 whisper.cpp 后端 |
| `首页.md` 索引 + CSS 片段 | 站内列表与筛选 |

## 后续

- 标签页、分组管理页（当前只有列表与详情）
- 全文搜索（Postgres `tsvector` 或 `pg_trgm`）
- 划线批注的交互与回显
- 浏览器书签脚本 / iOS 分享扩展
- 抓取失败的可视化统计与自动重试上限
