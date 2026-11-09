# 交接：阅读收集（reading-collector）· 2026-11-07

给接手这个项目的远程 agent / 下一个会话。上游对话已完成一轮大改，这里是当前真实状态。

## 一句话

`reading-collector` 已经是**可用的云端阅读库**：贴链接/订阅 RSS/导入 Markdown → 抓正文或转写音视频 → AI 概括 → 划线批注 → 分享（短链/微信码/金句图）。线上 <https://reading.gxwtf.cn>。

## 运行事实

| 项 | 值 |
| --- | --- |
| 服务器 | `ssh gx`（39.105.54.184:6000，gxwtf，已配密钥免密；sudo 部分免密） |
| 目录 | `~/gxwtf_reading`（Next 16 + Prisma 7 + Python worker） |
| 服务 | `gxreading`（3005）、`gxreading-worker`；`sudo -n systemctl restart gxreading` |
| 库 | PostgreSQL `gxwtf_reading`；迁移在 `prisma/migrations`（含 `add_trgm_indexes`、`add_share_token`） |
| 仓库 | `gxwtf/reading-collector`（主）+ `kyoukawa/reading-collector`（镜像） |
| 文档 | `docs/wiki/*`，发布在 `dev.gxwtf.cn/reading/` |

## 当前状态（2026-11-10）

- 书库已收敛为**根目录单一副本**：`~/reading-books/u<id>/*.epub|pdf` 为唯一真身（按账号分目录），`Readest/books/<hash>/` 走硬链接，`library.json` 由脚本生成
- 一条龙：`sh worker/sync_library.sh`（扫描 → 书名/作者清洗 → 元数据+封面 → 发布 → 去重 → 孤儿清理），上传即触发，另有定时任务
- 四层计数一致（2026-11-10 实测）：u2691 根目录 10 / DB 10 / Readest 目录 10 / library.json 10；u16 新账号 0/0/0/0；`sync_library.sh` 复跑新增 0、孤儿 0
- 账号隔离已落地：新账号自动开通书库目录 + 独立 WebDAV 实例/凭据，打开阅读器时自动写入本账号 WebDAV 配置
- 服务：`gxreading`、`gxreading-worker`、`gxreading-dav`、`readest`、`nginx` 均 active；`pnpm typecheck` 通过
- 部署：零停机脚本 + `flock` 串行构建，保留旧 chunk；**禁止在仓库内裸跑 `pnpm build`**
- 账号隔离第一阶段已提交（`98f7058`，书库/笔记按广学账号隔离 DB/API/页面）
- 进行中（未提交）：EPUB 导入（`jszip` 解包 + `turndown` 转 Markdown，`/api/entries/epub` + `src/lib/{epub,entry-import}.ts`），Markdown 导入已抽到 `saveTextEntry` 复用；另有 `worker/prune_stale_books.py` 与 `readest.ts` 跳过 `Readest/`、`covers/` 目录的小修

## 已上线功能（本次会话）

- 批量导入：链接、B 站收藏夹/合集、RSS 订阅（30 分钟自动拉新）、**Markdown**（文件/粘贴）、**OPML**
- 抓取：trafilatura 正文、pypdf（含 arXiv）、知乎（需 Cookie）、B 站/YouTube 转写（whisper 或官方字幕）
- AI：概括（多 key 轮换 + BYOK）、**自动打标**、`/settings` 站点登录态（知乎/B站/微博/小红书）
- 阅读：两栏布局、只看概括、字号/行宽、划线批注 + 批注整理页、**金句分享图**（宋/楷/圆/黑 × 深浅）
- 视频：精确播放（本地 mp4 + HLS）、逐行字幕跟随、关键帧、**摘要时间戳跳转**
- 分享：7 位短码 `/s/<code>`、OG 卡片、微信二维码
- 基础设施：**PWA**（manifest/sw/share target）、**MCP**（`mcp/server.py`，4 个工具）、`pg_trgm` 索引、`/api/health`、`scripts/{selfcheck,selfprompt,smoke}.sh`

## 设计约束

- 视觉与 `ti.gxwtf.cn`（新版题库）对齐：oklch 语义令牌、`--brand` 品牌红、`rounded-xl` 卡片、`Button size="sm"` 筛选胶囊、导航红色下划线
- 改前端必须过 `pnpm typecheck` + `pnpm build`；只能使用语义 token，禁 `#hex`、禁 `bg-xxx/15` 这类任意透明度（Tailwind 可能不生成）
- 提交：Conventional Commits + 中文；改完同时推主仓

## 已知坑（都踩过）

1. `pkill -f "xxx"` 会匹配到 SSH 自己的命令行 → 用 `fuser -k <port>/tcp`
2. `sudo -S` 读 stdin，heredoc 会抢走密码 → 先写 /tmp 再 `sudo cp`
3. GitHub 偶发拒推（TLS/commit_refs_rules）→ `git bundle` + scp 中转
4. satori（next/og）：每个 div 必须显式 `display`；字体文件被截断会报 `Offset is outside the bounds of the DataView`
5. B 站直链是 AV1 + DASH 分片，Safari 播不了 → 必须转 H.264 并切 HLS
6. `b23.tv` 短链没有 BV 号 → 入库前要 HEAD 跟随解析

## 未完成（roadmap 剩余）

- 语义检索（pgvector + 摘要 embedding）
- 全文快照（monolith 单文件 HTML，防原站失效）
- 阅读统计/回顾、TTS
- 分组分享（一次分享一个分组）

见 `docs/ROADMAP.md`。

## 远程 agent 注意

- 远程 agent **不能 sudo、不能 git push**；需要重启/推送时把命令写进交付说明，由端上或人执行
- 项目路径 `/home/gxwtf/gxwtf_reading`，构建用 `pnpm build`（固定 `--webpack`）
