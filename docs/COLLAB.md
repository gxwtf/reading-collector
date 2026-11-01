# 项目状态（所有工作前必读）

> 每次开工前先读本文件；每次完工后把进展写进下面的「进展记录」。
> 目的是让不同会话之间不重复劳动、不踩同一个坑。

## 活跃项目

| 项目 | 位置 | 远程 | 状态 |
|---|---|---|---|
| reading-collector | `/var/minis/workspace/reading-collector/` | github.com/kyoukawa/reading-collector | 运行中，手动触发 |
| 英语语料库 | Obsidian vault → `语料库/` | — | 长期维护 |
| 语文语料库 | Obsidian vault → `语文语料库/` | — | 长期维护 |

## Obsidian vault

根目录：`/var/minis/mounts/7A84464D-AA03-41E8-A2F3-C38F2CA047D0/知识库`
**根目录只允许文件夹，不放零散文件。** 现有：`语料库/`、`语文语料库/`、`阅读收集/`

## 铁律

1. **动手前先读本文件**，再 `git pull`（代码项目）
2. **本地不是权威**，远程仓库/挂载盘才是
3. **查重**：`find / -maxdepth 5 -name "<文件名>"`、`minis-sessions-cli search --keywords "<主题>"`
4. **完工后必须**：向老大说清改了什么 → 推 GitHub（代码项目）→ 追加「进展记录」

## 进展记录（最新在上）

### 2026-11-01

- **reading-collector**：四个脚本重建完成（`config/inbox/archive/transcribe.py`），依赖全用 PATH 版本，不建 venv
- **reading-collector**：Notion 镜像改幂等（`scripts/notion.py`），URL→page_id 映射，重跑走更新 `ea8f65d`
- **reading-collector**：技能文档补充 notion 用法 `b7e3bbe`
- **协作机制**：新增本文件 + 技能「铁律 0：先同步再动手」 `3e185df`
- **阅读收集**：Obsidian 归档结构建立（`阅读收集/首页.md` + `<年>/` + `附件/`）

### 2026-10-27

- **语文语料库**：第二次呼吸入库（一稿 46 → 二稿 48，一类上），复习队列 12 → 23 单元
- **语文语料库**：目录约定写死（一题一文件夹、文件名规格、重复文件夹用 md5sum 比对）

### 2026-10-26

- **英语语料库**：迁入 Obsidian vault「知识库」，复习改手动触发（删掉 20:00 定时任务）
- **英语语料库**：改为选稿制（AI 出候选 → 用户打勾把关）
- **content-collector**：Grok 自动化迁移到 Minis（该版本已废弃，被 reading-collector 取代）

## 平台事实速查

- 依赖：`yt-dlp`、`ffmpeg`、`apple-speech`、系统 `python3` 都在 PATH。**不建 venv、不 pip install**
- `apple-speech -q` 返回 `{"segments":[{"substring":...}]}`，拼 `substring` 不是 `text`
- 语音识别**必须串行**，并发会被限流（6 路并发 61 片只成 1 片）
- `notion-create-pages` 的 pages 项：`{"properties":{"title":...},"content":...}`
- `notion-update-page` 的 `replace_content` 需要 `allow_deleting_content: true`
- `notion-delete-pages` 的 `page_ids` 必须是 **UUID**，且需 `user_confirmed: true`
- `apk` 报锁错误：`kill -9 $(pgrep apk); rm -f /lib/apk/db/lock`
- **Minis 定时任务不持久**，App 重启会丢。当前 reading-collector 选择全手动触发
- `/var/minis` 不支持符号链接，venv 不能建在里面
- `.pages` 的正文只存在于 `preview.jpg`，`Document.iwa` 抽不出文字
