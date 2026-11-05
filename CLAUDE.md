# 项目开发与测试规范（阅读收集）

## 项目定位

「阅读收集」是广学五题坊（广坊）旗下的**个人知识流水线工具**：把散落在待办里的链接
抓成干净的 Markdown，归档进 Obsidian，再勾掉待办。视频与播客先转逐字稿再成稿。

- 仓库：<https://github.com/gxwtf/reading-collector>
- 定位：**独立 CLI 工具集**，不依赖任何服务端，也不依赖付费 API
- 与「广学英语」「作文积累本」不同：本仓库**没有 Web 服务、没有数据库**，
  产物是 Markdown 文件（Obsidian vault），所以不需要部署到服务器

## 技术栈

- Python ≥ 3.9，**优先标准库**；3.11+ 才有 `tomllib`，低版本需 `pip install tomli`
- 配置：`config/config.toml`（TOML）+ 环境变量覆盖
- 外部命令：`ffmpeg` / `ffprobe` / `yt-dlp` / `whisper-cli` / `minis-mcp-cli`
- 语音识别后端可插拔：`whispercpp`（推荐）/ `apple` / `whisper`
- 归档目标：Obsidian（权威）+ Notion（从属镜像，可选）

## 核心规范

- **不留硬编码路径。**任何路径、命令名、平台差异都走 `scripts/config.py`，
  需要新的开关就在 `DEFAULTS` 里加键，并同步 `config/config.example.toml`。
- **脚本可单独运行。**每个脚本都是独立 CLI，彼此只共用 `config`，
  不共享内部状态；新增脚本也必须能被 `python3 scripts/xxx.py --help` 独立调用。
- **失败要可诊断。**报错说清「缺什么」和「怎么补」，不要只抛 traceback。
- **从属步骤不阻塞。**Notion 镜像这类步骤失败就记一笔，不能中断主流程，也不回滚已落的笔记。
- **成功率优先于并发。**语音识别并发会限流，必须串行 + 间隔 + 重试；
  不要为了快改成并发池。
- 新依赖必须能 `pip install` 到纯 Python 环境；涉及 C 扩展的依赖需要在
  `skills/video-notes/SKILL.md` 里写清平台限制（例如 `ctranslate2` 不支持 musl）。

### 严禁破坏数据

除非明确要求，否则不得删除或大规模修改知识库内容。高危操作包括：
清空 vault 目录、批量重写已归档笔记、覆盖 `config/notion-map.json`、
对已有笔记执行 `--force` 重抓、`git clean -xdf` 打掉未提交的配置。

执行前必须说明命令、原因、影响范围与风险，并等待人工确认。

### 顺序铁律

**笔记没落盘就不勾待办。**归档顺序固定为：

```
写笔记 → 重建索引 → 勾完成 → 镜像 Notion
```

任何一步失败都停在原地，不越级。

### 必须测试

代码修改后不得直接结束任务：

1. `python3 -m compileall -q scripts` 必须无报错；
2. 涉及待办读写、归档、转写的改动，用 examples 起一次干跑：
   `python3 scripts/inbox.py --backend file --inbox examples/inbox-example.md`；
3. 改了 `archive.py` 的输出格式（文件名、标签、front-matter、首页表格），
   必须在临时 vault 里跑一遍并检查生成的 Markdown，**不要直接拿真实 vault 试**；
4. 改了转写相关代码，至少用一个 10 分钟以内的短视频完整跑通一次。

## 目录约定

```
scripts/    可独立运行的 CLI（唯一可执行代码来源）
skills/     agent 技能定义（SKILL.md），与运行时副本保持同步
config/     配置样例（真实 config.toml 不入库）
docs/       设计说明与协作约定
examples/   输入 / 输出样例，测试时可直接用
snippets/   Obsidian CSS 片段
```

## 提交规范

- **Conventional Commits**，类型 + 可选 scope + 中文描述，例如
  `feat(archive): 文件名超过长度上限时保留扩展名`、`docs: 同步设计说明`。
- 一个提交只做一件事；纯格式化改动单独提交。
- 分支持续保持 `main`，不建长期开发分支。

## 未来规划

- 待办后端继续可插拔：目前有 `frogtodo` 与 `file`，可加 Todoist / Things
- 归档前的内容清洗（去广告、去导航）做成独立可配置步骤
- 索引页支持按标签、来源多维筛选
