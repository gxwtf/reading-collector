# 全局记忆

> **所有工作前先读本文件；每次完工后把进展写进「进展记录」。**
> 目的：不同会话之间不重复劳动、不踩同一个坑。
> 分工：本文件上半部分是**可复用的知识**（怎么做事），下半是**进展记录**（做到哪了）。
> 最后更新：2026-11-01

---

# 一、协作铁律

1. **动手前先同步**：读本文件 → `git pull` → `git log --oneline -5` → `git status`，再 `find` 本地是否已有同名实现。**别凭自己刚写的东西就开工。**
2. **本地工作区不是权威，远程才是。** 本地缺文件或比远程短，说明本地是旧的——先 `git pull`，或重新 clone 到临时目录对比。
3. **功能更新必须讲清楚 + push**：每次改完功能，说清做了什么、为什么、怎么验证的，然后推 GitHub，不用再问。
4. **完工后必须**：说清改了什么 → 推 GitHub（代码项目）→ 追加本文件「进展记录」→ **跑 `memsync.sh` 同步三份副本**。
   ```sh
   sh /var/minis/workspace/reading-collector/memsync.sh
   ```
5. **聊天记录不跨会话共享**，但文件系统共享。状态一律落到文件里，不要指望别的情境记得。
6. **反复踩同一个坑是失职**：修好一个坑，同时写进本文件或对应 SKILL.md。

### 查重办法
```bash
find / -maxdepth 5 -name "<关键文件名>" 2>/dev/null
minis-sessions-cli search --keywords "<主题>"
```

> ⚠️ **多个会话会同时改同一仓库**。2026-11-01 实测：本地改完准备推时，远端已有别人 3 个提交
> （其中 `scripts/notion.py` 是 314 行完整实现，比当时的简版强得多）。
> **动代码前 `git pull`，推之前再 `git fetch` 看一次。** 已存在的功能只补差额，改写别人实现前先问老大。

---

# 二、活跃项目

| 项目 | 位置 | 远程 | 状态 |
|---|---|---|---|
| reading-collector | `/var/minis/workspace/reading-collector/` | github.com/kyoukawa/reading-collector | 运行中，手动触发 |
| 英语语料库 | Obsidian vault → `语料库/` | — | 长期维护 |
| 语文语料库 | Obsidian vault → `语文语料库/` | — | 长期维护 |

## Obsidian vault

根目录：`/var/minis/mounts/7A84464D-AA03-41E8-A2F3-C38F2CA047D0/知识库`
**根目录只允许文件夹，不放零散文件。** 现有：`语料库/`、`语文语料库/`、`阅读收集/`

阅读收集结构：`首页.md`（自动重建的索引）+ `<年>/<日期>-<标题>.md` + `附件/`

## reading-collector（开源）

- 用途：待办里的链接 → Obsidian 笔记 → 勾完成 → 可选镜像 Notion
- 脚本：`scripts/{config,inbox,archive,notion,transcribe}.py` + `install.sh`
- Notion 镜像是独立幂等模块，URL→page_id 记在 `config/notion-map.json`
- 已装技能：`reading-collector`、`video-notes`、`github-maintainer`

**用户确认过的规则：**
- 入口 = 青蛙todo 分组「阅读收集」，**标题写题目，正文放链接**
- **Obsidian 是权威，Notion 是从属镜像**（失败不阻塞、不回滚、不重试）
- 顺序固定：写笔记 → 重建索引 → **勾完成 → 镜像**。**笔记没落盘就不勾**
- 手动触发，**无定时任务**
- **Obsidian 是唯一权威，Notion 只负责网页浏览**；Notion 堆放区已废弃

---

# 三、环境事实（Minis / iSH / Alpine）

| 项 | 事实 |
|---|---|
| Python | 系统 `python3` 3.12，`/usr/bin/python3` |
| Shell | 默认 BusyBox ash，无 bash 特性保证 |
| 包管理 | `apk add py3-<name>` 优先；纯 Python 才用 `pip` |
| **`/var/minis` 不支持符号链接** | venv 不能建在里面，放 `/opt` |
| **无 `/dev/fd`** | 进程替换 `<(...)` 不可用，走管道或临时文件 |
| **`chmod` 无效** | 设执行位用 `git update-index --chmod=+x` |
| 磁盘 | 约 30G 可用，注意大文件 |
| **Minis 定时任务不持久** | App 重启会丢；当前 reading-collector 全手动触发 |

**依赖**：`yt-dlp`、`ffmpeg`、`ffprobe`、`apple-speech`、系统 `python3` 都在 PATH。**不建 venv、不 pip install。**

`apk` 报锁错误：`kill -9 $(pgrep apk); rm -f /lib/apk/db/lock`

---

# 四、GitHub 免密推送（已配置，不要再授权）

| 用途 | 路径 |
|---|---|
| git 凭据 | `/root/.config/reading-collector/git-credentials` |
| 裸 token | `/root/.config/reading-collector/github_token` |
| 备份 | `/var/minis/shared/.credentials/` |

- 全局 `credential.helper = store --file=/root/.config/reading-collector/git-credentials`
- **remote URL 里不放 token**
- **绝不 `echo`/`cat` 这些文件内容**，只用 `T=$(cat 路径)`
- 提交必须带 `-c commit.gpgsign=false`，否则卡住；无 TTY 时再加 `-c core.editor=true`
- 推送用 `git push -u origin HEAD`，别写死 `master`
- 账号：`kyoukawa`

**GitHub MCP 走不通**：`clientId` 为空 → 设置页 Authorize 按钮是灰的。GitHub **不支持动态客户端注册**。
只能走 device flow（VS Code 公开 id `01ab8ac9400c4e429b23`），流程见 `github-maintainer` 技能。

---

# 五、技术坑

### 语音识别
- **`ctranslate2` 只有 glibc 版，无 musl** → faster-whisper 在 Alpine 上导入即**段错误**；
  它的 `.so` 被 dlopen 后还会让同进程后续 `import av` 也崩。强制装 / 预加载 / gcompat / 换 libgomp 全试过都不行。
  **结论：iSH 上不要碰 ctranslate2，用 `apple-speech`。**
- **并发会限流**：6 路并发时 61 片只成功 1 片。必须**串行 + 间隔 0.4s + 重试 4 次**
- 识别语言必须与原声一致（`en-US` / `zh-CN`），**选错是乱码不是效果差**
- `apple-speech -q` 返回 `{"segments":[{"substring":…}]}`，拼 `substring` 不是 `text`

### 青蛙todo MCP
- `content` 是 **Quill Delta 富文本**，链接在 `attributes.link` 里，不能只靠正则
- 建条目必须用 **`title`** 字段，`content` 会被强制置空
- 删除要先 `frogtodo_preview_changes` 拿 previewId，再 `frogtodo_apply_changes`

### Notion MCP
- `notion-create-pages` 的 pages 项 = `{"properties":{"title":…},"content":…}`
- `notion-update-page` 的 `replace_content` 需要 `allow_deleting_content: true`
- `notion-delete-pages` 的 `page_ids` 必须是 **UUID**，且需 `user_confirmed: true`
- 父页面「有价值内容收集」`40209d7f-d7ec-8175-9c6a-d69d5f097cce`

### 内容抓取
- `mp.weixin.qq.com` 可直接抓，正文在 `div#js_content`；偶发验证墙需浏览器兜底
- B 站 `x/player/v2` 与 `x/player/wbi/v2` **都要登录**才返回字幕列表，未登录返回空数组 → 走音频转写
- `.pages` 的正文只在 `preview.jpg` 里，`Document.iwa` 抽不出文字

---

# 六、写作/内容偏好（老大）

- 语料库：**选稿制**——AI 出候选，用户打勾选，未勾的不收
- 复习：**手动触发**「复习/抽卡」，每次 3 条，**中英对照一起给**，不要翻译题
- 偏爱**画面感短句**，不喜欢抽象大词堆叠
- 写作习惯「先讲道理再举例」，每个理由要配一个可插拔的具体事例
- 说「这句话好」= 最高信号：标 ★、进复习队列

---

# 七、进展记录（最新在上）

## 2026-11-01

- **记忆同步脚本**：`sh /var/minis/workspace/reading-collector/memsync.sh` 一条命令同步三份副本并推送；`--check` 核对一致性，`--no-push` 只同步。此前手动 cp 漏掉过仓库 docs 副本（`/tmp/rc-remote` 被清后彻底丢失）
- **Notion 堆放区已废弃**：删除页面 `40209d7f-d7ec-81be-bab3-e89df8d57cd3`；入口只剩待办「阅读收集」分组。**Obsidian 是唯一权威，Notion 只负责网页浏览**，落盘成功即归档成功 `bfc000b`
- **Notion 镜像加返回**：`build_content` 顶部插入 `← [返回 有价值内容收集]`；前面必须带箭头字符，否则 Notion 把整行识别成 page mention 吞掉文字 `6a4a510`
- **Notion 清理**：删除 3 篇 Grok 时代遗留（亚玛芬/最有效的休息/给高三三则时文），补建「如果Personal Agent不只属于一个人」，现与 Obsidian 4 篇一一对应
- **阅读收集返回链接修复**：vault 里 `语料库/`、`语文语料库/`、`阅读收集/` 都有 `首页.md`，wikilink 只写 `[[首页]]` 会跳到错误文件夹（实测跳到英语语料库）→ 必须写 `[[阅读收集/首页|…]]` `e7633de`；顺带清掉 `阅读收集/阅读收集/` 空目录
- **阅读收集笔记加返回**：每篇顶部 `[[首页|← 返回 阅读收集]]`，CSS 做成胶囊按钮；`build_note` 自动插入 `619b320`
- **阅读收集首页链接修复**：表格单元格里 `[[路径|别名]]` 的竖线必须写成 `\|`，否则被当成列分隔符、链接退化成纯文本 `5f0eb2f`
- **阅读收集命名规则**：文件名去掉日期前缀，只留标题；日期改写进嵌套标签 `#阅读收集/2026/11`；索引按月分组 `6459829`
- **阅读收集首页美化**：卡片式 CSS snippet（表格行转卡片/月份小标签/hover 高亮），`archive.py` 重建时自动带 `cssclasses: rc-home`，不污染其他笔记 `1de1b76`
- **同步核查**：远程 `6fa7bc8` 已把 COLLAB.md 并入 GLOBAL.md；本地三份副本（memory/shared/docs）md5 一致；`SOUL.md` 引用从 COLLAB.md 改指 GLOBAL.md；技能与 `scripts/*.py` 全部对齐远程最新
- **全局记忆**：本文件建立，合并了 `GLOBAL.md` 与 `COLLAB.md`，成为唯一权威状态文件；技能统一要求开工前先读本文件
- **github-maintainer**：新建技能，提交/推送/建仓/改名/release/issue 全流程，凭据持久化免授权
- **reading-collector 开源**：https://github.com/kyoukawa/reading-collector 上线（公开）
- **reading-collector**：审查发现并修复 8 处阻断性问题（vault 误探测、install.sh 无执行位、sed 特殊字符、收件箱标题行链接、`[X]` 勾错位、YAML 转义、索引解析、0 秒空片）
- **reading-collector**：Notion 镜像改幂等（`scripts/notion.py`），URL→page_id 映射，重跑走更新 `ea8f65d`
- **reading-collector**：协作机制 + 技能「铁律 0：先同步再动手」 `3e185df`
- **video-notes**：本地转写流水线落地，apple-speech 串行 + 重试，45 分钟视频约 2 分钟
- **阅读收集**：Obsidian 归档结构建立；首批归档 4 篇（含 CS146S 讲座笔记、Super-agent 设计探索）

## 2026-10-27

- **语文语料库**：第二次呼吸入库（一稿 46 → 二稿 48，一类上），复习队列 12 → 23 单元
- **语文语料库**：目录约定写死（一题一文件夹、文件名规格、重复文件夹用 md5sum 比对）

## 2026-10-26

- **英语语料库**：迁入 Obsidian vault「知识库」，复习改手动触发（删掉 20:00 定时任务）
- **英语语料库**：改为选稿制（AI 出候选 → 用户打勾把关）
- **content-collector**：Grok 自动化迁移到 Minis（该版本已废弃，被 reading-collector 取代）

---

# 八、维护约定

- **工作前先读本文件**；有进展就更新「进展记录」。
- 可复用的知识写进第一~六节，流水写进第七节。**第一节到第六节要精简，别变成日志堆。**
- 本文件与 `/var/minis/shared/COLLAB.md` 是同一份（互为副本），改完两边同步。
