# 架构与数据流

## 一张图

```
浏览器 ──► Next.js 16（App Router）
             │  Server Actions：收藏、状态、划线、分组
             │  Route Handlers：SSO、worker 回调、导出、媒体流、开放 API
             ▼
        PostgreSQL（gxwtf_reading）
             ▲
             │ HTTP + Bearer INTERNAL_API_KEY
        Python worker（抓正文 / 转写 / 生成概括）
```

- **站点不干重活**：收藏只写 `Entry(state=pending)` + 一条 `FetchJob` 就返回
- **worker 不连库**：只通过 `/api/worker/jobs*` 领任务、回填结果，可单独重启扩容
- **任务领取原子**：`FOR UPDATE SKIP LOCKED`，多 worker 不会撞车

## 抓取与转写

| 任务 | 流程 |
| --- | --- |
| `fetch` | httpx 取页面 → trafilatura 抽正文转 Markdown → 回填 `Entry.contentMd` |
| `transcribe` | yt-dlp 取音轨 → ffmpeg 转 16k wav → whisper.cpp 转写 → 存 `Transcript`（分段 + 词级时间戳） |

失败会写 `FetchJob.error`、条目置 `failed`，页面给「重试」按钮。

## 阅读与标注

- 文章：`next-mdx-remote/rsc` 渲染；划线的 anchor 统一相对 `.prose-reading` 计算字符偏移，
  渲染前校验 `slice(start,end) === quote`，对不上就按原文重新定位
- 视频：逐字稿按「句末标点 / 48 字 / 7 秒」切成歌词行，跟随播放按行高亮
  - YouTube 走官方 IFrame API 拿真实 `currentTime`
  - B 站 iframe 无接口：默认估算；开启「精确播放」后改为服务端转码本地 mp4，用 `<video>` 当唯一时钟

## 精确播放（可选，默认关闭）

1. 设置页开启 → 视频页出现「准备视频」
2. `POST /api/media/<id>/prepare`：后台 `yt-dlp` 下载并合并为 `~/reading-media/<id>.mp4`
3. `GET /api/media/<id>/file`：支持 Range 的本地流
4. 前端用原生 `<video>`，暂停/拖动/逐行高亮全部精确

> iPad/iPhone 对本地流式 mp4 兼容性差，会自动回退内嵌播放器。

## 概括

- 抽取式：按小标题取每节首句；无小标题的长文按位置切 8 段
- AI 式：`LLM_CONFIGS` 里的多把 key 依次尝试，输出「一句话结论 / 分章要点 / 金句」
- 优先级：用户 BYOK > 站点默认；全失败回退抽取式
