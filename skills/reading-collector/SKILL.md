---
name: reading-collector
description: 把待办应用「阅读收集」分组里的链接整理成 Obsidian 笔记。用户说「整理收集」「处理待办」「收集这个链接」时使用。流程：读待办 → 抓正文（文章走 HTTP/浏览器，视频走转写）→ 写 Obsidian → 勾完成 → 可选镜像 Notion。
---

# reading-collector

用户在待办应用的分组里丢「题目 + 链接」，手动喊 agent 时批量整理成笔记。
**手动触发，没有定时任务。**

## 0. 先定位仓库

```bash
# 依次尝试：显式环境变量 → 常见克隆位置 → 全局查找
RC="${READING_COLLECTOR_ROOT:-}"
[ -n "$RC" ] && [ -d "$RC/scripts" ] || \
for d in "$HOME/reading-collector" "./reading-collector" \
         "/var/minis/workspace/reading-collector"; do
  [ -d "$d/scripts" ] && { RC="$d"; break; }
done
[ -n "${RC:-}" ] || RC="$(dirname "$(dirname "$(find / -name transcribe.py \
  -path '*/reading-collector/scripts/*' 2>/dev/null | head -1)")")"

test -d "$RC/scripts" || { echo "找不到仓库，请设置 READING_COLLECTOR_ROOT"; exit 1; }
echo "RC=$RC"
```

**不要自己造 venv、不要 pip install。**依赖应在安装阶段装好；
缺什么先跑 `bash "$RC/scripts/install.sh" --dry-run` 看缺哪项。

## 1. 读待办

```bash
python3 "$RC/scripts/inbox.py"            # 人类可读
python3 "$RC/scripts/inbox.py" --json     # 结构化，含 id 与 urls
```

没有 MCP 客户端时退回本地收件箱（Markdown 复选框格式）：

```bash
python3 "$RC/scripts/inbox.py" --backend file --inbox ./inbox.md
```

**没链接的条目跳过，不要猜。**

## 2. 按类型取正文

| 类型 | 判定 | 做法 |
|---|---|---|
| 视频 / 播客 | bilibili、b23.tv、youtube、youtu.be、小宇宙、Apple Podcasts | 走 `video-notes` |
| 公众号 | `mp.weixin.qq.com` | 静态抓 `div#js_content`；遇验证墙用浏览器渲染 |
| 普通网页 | 其它 http(s) | 静态抓 `article`/`main`，失败则浏览器渲染取 innerText |
| X | `x.com` / `twitter.com` | 浏览器渲染；不行就请用户粘正文 |

清洗：保留标题、作者、日期、核心论点、关键引语、层级；删除广告、分享栏、相关推荐、评论、Cookie 提示、App 引流。中文原样保留，不翻译。

## 3. 写 Obsidian

```bash
python3 "$RC/scripts/archive.py" \
  --title "标题" --url "https://…" --source "微信公众号" --author "作者" \
  --tags "公众号" --body ./body.md
```

- 默认写到 `<vault>/阅读收集/<年>/<日期>-<标题>.md`，含 front-matter 与来源 callout
- 同时重建 `首页.md` 索引（不要手工编辑该文件的表格区）
- 同一 URL 重跑会覆盖原文件，不会产生第二篇

## 4. 勾完成

```bash
python3 "$RC/scripts/inbox.py" --done <id>
```

**顺序不能反**：确认笔记落盘成功后再勾。失败就留着待办，下次重试。

## 5. 镜像 Notion（可选，从属步骤）

配置 `[notion] enabled = true` 与 `parent_page_id` 后自动执行，或加 `--notion` 强制。
**镜像失败不阻塞、不回滚、不重试**，只在汇报里提一句。

## 汇报格式

| 标题 | 来源 | 笔记 | 镜像 |

外加：成功 N 条、失败 M 条、跳过 K 条（无链接）。

## 视频分支

```bash
python3 "$RC/scripts/transcribe.py" "<URL>" --locale en-US
```

- `--locale` 必须是**原声语言**：英文 `en-US`，中文 `zh-CN`。选错会乱码。
- 产出 JSON：`title / uploader / duration / chapters[] / transcript[]`
- 逐字稿是原料不是成品，**笔记要你自己写**：

```
# 标题
一句话结论 → ## 分章要点（按 chapters 时间轴，讲机制不写流水账）
→ ## 关键概念速查（表格） → ## 可直接抄的做法 → ## 金句（原文+译文+时间戳）
```

归档时 `source` 填平台名，`tags` 加 `视频`。详见 `skills/video-notes/SKILL.md`。
