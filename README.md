# 阅读收集

广学五题坊（广坊）旗下的**个人知识流水线工具**：把散落在待办里的链接整理成可检索的本地知识库。

你在待办 App 里随手丢一条「题目 + 链接」，回头喊一声 agent，它把正文抓下来、清洗成干净的
Markdown、归档进 Obsidian、勾掉待办。视频与播客先转成逐字稿再写笔记。

- 仓库：<https://github.com/gxwtf/reading-collector>
- 形态：纯 CLI 工具集，无服务端、无数据库，产物就是 Markdown 文件
- **不依赖任何付费 API**：视频转写走本地语音识别，零额度、零登录

## 功能

- 待办收件箱：读出「阅读收集」分组里的条目（青蛙todo MCP 或本地 `inbox.md` 两种后端）
- 正文抓取：微信公众号、普通文章直接抓；需渲染的页面用浏览器兜底
- 视频转写：`yt-dlp` 抓音轨 + 章节，`ffmpeg` 切片，本地语音识别逐片转写
- 归档成稿：干净的 Markdown（front-matter + 正文 + 来源），按年份分目录
- 索引重建：`首页.md` 自动生成，按月分组、卡片式排版（配 CSS 片段）
- 勾完成：归档成功后回写待办，失败则留着待重试
- Notion 镜像（可选、从属）：幂等同步，失败不阻塞、不回滚

## 工作原理

```
待办分组 ──► 读待办 ──► 分类抓取 ──► Obsidian 笔记 ──► 勾完成
                            │              │
                      文章/视频/播客       └──► Notion 镜像（可选，从属）
```

三条设计取舍：

- **待办是收件箱，Obsidian 是权威库。**待办只负责「还没处理的东西」，处理完就消失，
  不会像收藏夹一样越积越烂。
- **Obsidian 主库、Notion 从属。**镜像失败不阻塞、不回滚。笔记先落盘再勾待办，
  写失败就留着重试——不会丢内容。
- **转写本地跑。**不花钱、不排队、不限次。代价是慢一些（45 分钟视频约 2 分钟）。

## 依赖

| 组件 | 必需 | 说明 |
| --- | --- | --- |
| Python ≥ 3.9 | 是 | 3.11+ 才支持 `config.toml`，低版本用环境变量 |
| `ffmpeg` / `ffprobe` | 是 | 切音频 |
| `yt-dlp` | 是 | 抓视频与章节 |
| `whisper-cli`（whisper.cpp） | 二选一 | 推荐，纯 C++，musl / Android 可用 |
| `apple-speech` | 二选一 | macOS / iOS |
| `faster-whisper` | 二选一 | 任意 glibc 平台，依赖 `ctranslate2` |
| `minis-mcp-cli` | 否 | 读待办 / 镜像 Notion；没有就用 `--backend file` |

## 快速开始

```bash
git clone https://github.com/gxwtf/reading-collector.git
cd reading-collector

# 1. 检查依赖 + 生成 config/config.toml + 可选安装技能
./scripts/install.sh --vault "/path/to/你的vault" --install-skills

# 2. 在待办 App 里建一个分组，默认名「阅读收集」
#    建条目：标题写题目，正文放链接

# 3. 看看读到了什么
python3 scripts/inbox.py
```

没有 MCP 或不想用待办 App？用本地收件箱：

```bash
python3 scripts/inbox.py --backend file --inbox ./inbox.md
```

```markdown
- [ ] 一篇文章的标题
  https://example.com/post
- [ ] 一个视频的标题
  https://www.bilibili.com/video/BV1xxxx
```

## 配置

拷贝 `config/config.example.toml` 为 `config/config.toml` 再改。
**所有项都能用环境变量覆盖**，方便容器与 CI（见 `.env.example`）：

| 变量 | 作用 |
| --- | --- |
| `MINIS_VAULT` | Obsidian vault 根目录 |
| `READING_FOLDER` | 归档子目录（默认 `阅读收集`） |
| `READING_ASSETS` | 附件子目录（默认 `附件`） |
| `FROGTODO_CATEGORY` | 待办分组名 |
| `NOTION_ENABLED` / `NOTION_PARENT_PAGE_ID` | 开启 Notion 镜像与父页面 |
| `VIDEO_WORKDIR` | 转写临时目录 |
| `ASR_LOCALE` | 识别语言（`auto` / `zh-CN` / `en-US`） |
| `ASR_BACKEND` | `whispercpp` / `apple` / `whisper` |
| `WHISPER_MODEL` | whisper.cpp 模型路径 |
| `READING_CONFIG` | 指定其他配置文件路径 |

## 脚本

| 脚本 | 作用 |
| --- | --- |
| `scripts/inbox.py` | 读待办 / 标记完成，支持 `frogtodo` 与 `file` 两种后端 |
| `scripts/archive.py` | 写笔记、重建索引、镜像 Notion |
| `scripts/transcribe.py` | 视频转逐字稿，识别后端可插拔 |
| `scripts/config.py` | 统一配置：环境变量 > toml > 默认值 |
| `scripts/vaultbackup.sh` | vault 异地备份（含技能与配置副本） |

都是独立 CLI，可以单独用：

```bash
# 只归档一篇
python3 scripts/archive.py --title "标题" --url "https://…" \
  --source "微信公众号" --body ./body.md

# 只转写
python3 scripts/transcribe.py "https://www.bilibili.com/video/BV1xx" --locale zh-CN
```

## 配合 Agent 使用

`skills/` 下是两个可直接安装的 agent 技能：

- `reading-collector` — 主流程（读待办 → 抓取 → 归档 → 勾完成）
- `video-notes` — 视频转写与成稿

装到你的技能目录（如 `/var/minis/skills/` 或 `~/.claude/skills/`），
把 `READING_COLLECTOR_ROOT` 指向本仓库，然后说「整理收集」即可。

## 已知限制

- **语音识别语言必须与原声一致。**选错是乱码，不是「效果差点」。
- **识别不能并发。**实测并发 6 路时 61 个片段只成功 1 个；串行才能 61/61。
- **`ctranslate2` 不支持 musl。**Alpine 等 musl 发行版上 `faster-whisper` 导入即段错误，
  请改用 `whispercpp` 或 `apple` 后端。详见 `skills/video-notes/SKILL.md`。
- 需要登录的字幕接口（B 站 `x/player/v2`）未登录返回空数组，所以走音频转写而非字幕。
- 微信公众号可能触发验证墙，此时需浏览器渲染兜底。
- 带登录墙的站点（如 Notion 公开页以外的私有页面）抓不到正文。

## 目录结构

```
reading-collector/
├── scripts/          # 可独立运行的 CLI
├── skills/           # agent 技能定义（SKILL.md）
├── config/           # 配置样例（真实 config.toml 不入库）
├── docs/             # 设计说明与协作约定
├── examples/         # 输入 / 输出样例
├── snippets/         # Obsidian CSS 片段
└── CLAUDE.md         # 项目开发与测试规范
```

## 开发

见 [CLAUDE.md](CLAUDE.md)：核心规范、数据安全红线、提交与测试要求。

## License

MIT
