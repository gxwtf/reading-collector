# reading-collector

把「散落在待办里的链接」整理成「可检索的本地知识库」。

你在待办 App 里随手丢一条「题目 + 链接」，回头喊一声 agent，它把正文抓下来、
清洗成干净的 Markdown、归档进 Obsidian、勾掉待办。视频和播客会先转成逐字稿再写笔记。

**不依赖任何付费 API。**视频转写走本地语音识别，零额度、零登录。

```
待办分组 ──► 读待办 ──► 分类抓取 ──► Obsidian 笔记 ──► 勾完成
                            │              │
                      文章/视频/播客       └──► Notion 镜像（可选，从属）
```

## 为什么这样设计

- **待办是收件箱，Obsidian 是权威库。**待办只负责「还没处理的东西」，处理完就消失，
  不会像收藏夹一样越积越烂。
- **Obsidian 主库、Notion 从属。**镜像失败不阻塞、不回滚。笔记先落盘再勾待办，
  写失败就留着重试——不会丢内容。
- **转写本地跑。**不花钱、不排队、不限次。代价是慢一些（45 分钟视频约 2 分钟）。

## 快速开始

```bash
git clone <this-repo> reading-collector
cd reading-collector

# 1. 检查依赖 + 生成配置 + 可选安装技能
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

## 依赖

| 组件 | 必需 | 说明 |
|---|---|---|
| Python ≥ 3.9 | ✅ | 3.11+ 才支持 `config.toml`，低版本用环境变量 |
| ffmpeg / ffprobe | ✅ | 切音频 |
| yt-dlp | ✅ | 抓视频与章节 |
| apple-speech | 二选一 | macOS / iOS，Minis 自带 |
| faster-whisper | 二选一 | 任意平台：`pip install faster-whisper` |
| minis-mcp-cli | 可选 | 读待办 / 镜像 Notion，没有就用 `--backend file` |

## 配置

拷贝 `config/config.example.toml` 为 `config/config.toml` 再改。
**所有项都能用环境变量覆盖**，方便容器和 CI：

| 环境变量 | 作用 |
|---|---|
| `MINIS_VAULT` | Obsidian vault 根目录 |
| `READING_FOLDER` | 归档子目录（默认 `阅读收集`） |
| `FROGTODO_CATEGORY` | 待办分组名 |
| `NOTION_ENABLED` / `NOTION_PARENT_PAGE_ID` | 开启 Notion 镜像 |
| `VIDEO_WORKDIR` | 转写临时目录 |
| `ASR_LOCALE` | 识别语言（`auto` / `zh-CN` / `en-US`） |
| `ASR_BACKEND` | `apple` / `whisper` |
| `WHISPER_MODEL` | whisper 模型大小，默认 `small` |

## 脚本

| 脚本 | 作用 |
|---|---|
| `scripts/inbox.py` | 读待办 / 标记完成，支持 frogtodo 与 file 两种后端 |
| `scripts/archive.py` | 写笔记、重建索引、镜像 Notion |
| `scripts/transcribe.py` | 视频转逐字稿，可插拔识别后端 |
| `scripts/config.py` | 统一配置：环境变量 > toml > 默认值 |

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

装到你的技能目录（如 `~/.claude/skills/`），给 agent 设好 `READING_COLLECTOR_ROOT`
指向本仓库，然后说「整理收集」即可。

## 已知限制

- **语音识别语言必须与原声一致。**选错是乱码，不是「效果差点」。
- **识别不能并发。**实测并发 6 路时 61 个片段只成功 1 个；串行才能 61/61。
- **`ctranslate2` 不支持 musl。**Alpine 等 musl 发行版上 faster-whisper 导入即段错误，
  请改用 `apple` 后端。详见 `skills/video-notes/SKILL.md`。
- 需要登录的字幕接口（B 站 `x/player/v2`）未登录返回空数组，所以走音频转写而非字幕。
- 微信公众号可能触发验证墙，此时需浏览器渲染兜底。

## 目录结构

```
reading-collector/
├── scripts/          # 可独立运行的 CLI
├── skills/           # agent 技能定义（SKILL.md）
├── config/           # 配置样例
├── docs/             # 设计说明
└── examples/         # 产出样例
```

## License

MIT
