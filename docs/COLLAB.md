# 协作状态（single source of truth）

> **每次开新任务前先读这个文件；每次完成工作后更新它。**
> 目的：避免多个会话重复做同一件事。

## 当前项目

| 项目 | 位置 | 远程 | 状态 |
|---|---|---|---|
| reading-collector | `/var/minis/workspace/reading-collector/` | github.com/kyoukawa/reading-collector | 进行中 |

## 铁律

1. **动手前先查**：`git pull` → 看 `git log --oneline -5` → 看 `git status`
2. **本地不是权威**：远程仓库比本地工作区更新。改之前先同步，不要凭本地旧文件重写
3. **会话之间不共享上下文**：另一个会话可能刚改过同一批文件。用
   `minis-sessions-cli search --keywords "<主题>"` 查有没有别人做过
4. **每次功能更新必须**：
   - 向老大讲清楚改了什么、为什么、怎么验证的
   - 用 github-maintainer 推到 GitHub
   - 更新本文件的「变更记录」

## 变更记录

| 日期 | 会话 | 内容 | commit |
|---|---|---|---|
| 2026-11-01 | 阅读收集 | reading-collector 初版四脚本 + 技能 | cbe2817 及之前 |
| 2026-11-01 | 阅读收集 | Notion 镜像改幂等实现（scripts/notion.py） | ea8f65d |
| 2026-11-01 | 阅读收集 | 技能文档补充 notion 用法 | b7e3bbe |

## 已知平台事实（省得反复踩）

- 依赖全在 PATH：`yt-dlp`、`ffmpeg`、`apple-speech`、系统 `python3`。**不建 venv、不 pip install**
- `apple-speech -q` 返回 `{"segments":[{"substring":...}]}`，拼 `substring` 不是 `text`
- 语音识别**必须串行**，并发会被限流
- `notion-create-pages` 的 pages 项：`{"properties":{"title":...},"content":...}`
- `notion-update-page` 的 `replace_content` 需要 `allow_deleting_content: true`
- `notion-delete-pages` 的 `page_ids` 必须是 **UUID**（传 URL 会 400），且需 `user_confirmed: true`
- `apk` 报锁错误：`kill -9 $(pgrep apk); rm -f /lib/apk/db/lock`
- Minis 定时任务不持久，App 重启后会丢；用户当前选择**全手动触发**
