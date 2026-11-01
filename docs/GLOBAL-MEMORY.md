# 全局记忆

> 工作前先读这里。只放**可复用的知识**（环境事实、约定、坑），不放会话流水——流水在 `YYYY-MM-DD.md` 里。
> 最后更新：2026-11-01

---

## 0. 协作铁律

1. **动手前先同步**：`git pull` → `git log --oneline -5` → `git status`，再 `find` 本地是否已有同名实现。**别凭自己刚写的东西就开工。**
2. **功能更新必须讲清楚 + push**：每次改完功能，说清做了什么，然后推 GitHub，不用再问。
3. **聊天记录不跨会话共享**，但文件系统共享。状态一律落到文件里（技能、记忆、仓库），不要指望别的情境记得。
4. **反复踩同一个坑是失职**：修好一个坑，同时写进 SKILL.md 或这里。

---

## 1. 环境事实（Minis / iSH / Alpine）

| 项 | 事实 |
|---|---|
| Python | 系统 `python3` 3.12，`/usr/bin/python3` |
| Shell | 默认 BusyBox ash，无 bash 特性保证 |
| 包管理 | `apk add py3-<name>` 优先；纯 Python 才用 `pip` |
| **`/var/minis` 不支持符号链接** | 不能在里面建 venv，venv 放 `/opt` |
| **无 `/dev/fd`** | 进程替换 `<(...)` 不可用，走管道或临时文件 |
| **`chmod` 无效** | 设执行位用 `git update-index --chmod=+x` |
| 磁盘 | 约 30G 可用，注意大文件 |

### 常用已装工具
`ffmpeg` / `ffprobe` / `yt-dlp`（`/usr/local/bin` 与 `/usr/bin` 各一）、`rg`、`apple-speech`、`apple-vision`、`apple-nlp`、`minis-mcp-cli`、`minis-config`、`minis-sessions-cli`

### apk 锁残留
`apk` 报 "cannot lock" / "no such package" 时：
```bash
kill -9 $(pgrep apk); rm -f /lib/apk/db/lock
```

---

## 2. GitHub 免密推送（已配置，不要再授权）

| 用途 | 路径 |
|---|---|
| git 凭据 | `/root/.config/reading-collector/git-credentials` |
| 裸 token | `/root/.config/reading-collector/github_token` |
| 备份 | `/var/minis/shared/.credentials/` |

- 全局 `credential.helper = store --file=/root/.config/reading-collector/git-credentials`
- **remote URL 里不放 token**
- **绝不 `echo`/`cat` 这些文件内容**，只用 `T=$(cat 路径)`
- 提交必须带 `-c commit.gpgsign=false`，否则卡住
- 推送用 `git push -u origin HEAD`，别写死 `master`
- 账号：`kyoukawa`

### GitHub MCP 走不通
`clientId` 为空 → 设置页 Authorize 按钮是灰的。GitHub **不支持动态客户端注册**。
只能走 device flow（VS Code 公开 id `01ab8ac9400c4e429b23`），流程见 `github-maintainer` 技能。

---

## 3. 核心项目

### reading-collector（开源）
- 仓库：https://github.com/kyoukawa/reading-collector
- 本地：`/var/minis/workspace/reading-collector/`
- 用途：待办里的链接 → Obsidian 笔记 → 勾完成 → 可选镜像 Notion
- **项目级协作状态：`docs/COLLAB.md`（也是 `/var/minis/shared/COLLAB.md`），开工前必读**
- Notion 镜像已抽成独立模块 `scripts/notion.py`（幂等，URL→page_id 记在 `config/notion-map.json`），`archive.py` 延迟导入调用

> ⚠️ **多个会话会同时改这个仓库**。2026-11-01 实测：我本地改完准备推时，远端已有别人 3 个提交
> （其中 `scripts/notion.py` 是 314 行的完整幂等实现，比我当时的简版强得多）。
> **教训：动代码前先 `git pull`，推之前再 `git fetch` 看一次。**

**用户确认过的规则：**
- 入口 = 青蛙todo 分组「阅读收集」，**标题写题目，正文放链接**
- **Obsidian 是权威，Notion 是从属镜像**（失败不阻塞、不回滚、不重试）
- 顺序固定：写笔记 → 重建索引 → **勾完成 → 镜像**。**笔记没落盘就不勾**
- 手动触发，**无定时任务**

**脚本**：`scripts/{config,inbox,archive,transcribe}.py` + `install.sh`
**已装技能**：`reading-collector`、`video-notes`、`github-maintainer`

### Obsidian vault
- `/var/minis/mounts/7A84464D-AA03-41E8-A2F3-C38F2CA047D0/知识库`
- **vault 根只允许「语料库」「阅读收集」两个文件夹**，不放零散文件
- 阅读收集结构：`首页.md`（自动重建的索引）+ `<年>/<日期>-<标题>.md` + `附件/`

---

## 4. 技术坑（别再踩）

### 语音识别
- **`ctranslate2` 只有 glibc 版，无 musl** → faster-whisper 在 Alpine 上导入即**段错误**
- 更糟：它的 `.so` 一旦被 dlopen，会让同进程后续 `import av` 也崩
- 强制装 / sitecustomize 预加载 / gocompat / 换 libgomp **全都试过，都不行**
- **结论：iSH 上不要碰 ctranslate2**，用 `apple-speech`

### apple-speech
- **并发会限流**：6 路并发时 61 片只成功 1 片。必须**串行 + 间隔 0.4s + 重试 4 次**
- 识别语言必须与原声一致（`en-US` / `zh-CN`），**选错是乱码不是效果差**

### 青蛙todo MCP
- `content` 是 **Quill Delta 富文本**，链接在 `attributes.link` 里，不能只靠正则
- 建条目必须用 **`title`** 字段，`content` 会被强制置空
- 删除要先 `frogtodo_preview_changes` 拿 previewId，再 `frogtodo_apply_changes`

### Notion MCP
- `notion-create-pages` 的 pages 项 = `{"properties":{"title":…},"content":…}`
- `replace_content` 需要 `allow_deleting_content: true` 才能清旧块
- `notion-delete-pages` 必须 `user_confirmed: true`
- 父页面「有价值内容收集」`40209d7f-d7ec-8175-9c6a-d69d5f097cce`

### 微信文章
`mp.weixin.qq.com` 可直接抓，正文在 `div#js_content`；偶发验证墙需浏览器兜底。

### B 站字幕
`x/player/v2` 与 `x/player/wbi/v2` **都要登录**才返回字幕列表，未登录返回空数组。走音频转写绕开。

---

## 5. 写作/内容偏好（老大）

- 语料库：**选稿制**——AI 出候选，用户打勾选，未勾的不收
- 复习：**手动触发**「复习/抽卡」，每次 3 条，**中英对照一起给**，不要翻译题
- 偏爱**画面感短句**，不喜欢抽象大词堆叠
- 写作习惯「先讲道理再举例」，每个理由要配一个可插拔的具体事例
- 说「这句话好」= 最高信号：标 ★、进复习队列

---

## 6. 记忆维护约定

- **工作前先读本文件**。
- **有进展就同步**：可复用的事实写进这里；过程流水写进当日 `YYYY-MM-DD.md`。
- 本文件要**去重、精简**，别变成日志堆。
- 脚本与技能真丢了，从 `/var/minis/workspace/reading-collector/skills/` 拷回。
