# 项目开发与测试规范（阅读收集 · 云端版）

<important>
This is NOT the Next.js you know. 本项目用 Next 16，API 与约定与训练数据可能不同。
写代码前先读 `node_modules/next/dist/docs/` 里对应的指南，注意弃用提示。
</important>

## 项目定位

「阅读收集」是广学五题坊（广坊）旗下的**云端阅读库**：把链接收进来，后台抓正文 / 转写音视频，
在线读完、打标签。数据全在 PostgreSQL，**不再有 Obsidian、Notion 或本地 Markdown 库**。

- 仓库：<https://github.com/gxwtf/reading-collector>
- 线上：`reading.gxwtf.cn`（端口 3005，服务 `gxreading.service`）
- 与「作文积累本」（`gxwtf/writing`）同构：同一套技术栈、同一套 SSO、同样的目录约定

## 技术栈

- Next.js 16（App Router）+ React 19 + TypeScript 6，包管理只用 **pnpm**
- PostgreSQL + Prisma 7（`@prisma/adapter-pg`），库名 `gxwtf_reading`
- Tailwind CSS 4 + shadcn 风格组件，颜色只走语义令牌
- iron-session 9 + 广学账号 SSO
- 后台任务：Python worker（不连数据库，只走 HTTP 任务接口）

## 核心规范

### 身份与数据安全

- **Server Action 不接受前端传来的 `userId`。**一律服务端从会话取，`where` 里必须带 `userId`，
  避免拿别人的 id 越权操作。
- 待办、笔记、收藏都是用户私有数据，**没有公开分享页**；要加必须单独设计权限。
- 删除类操作要二次确认，且只删自己的数据。

### 抓取与转写

- **站点不干重活。**请求里只写 `Entry` + `FetchJob` 就返回，抓取一律交给 worker。
  超过 Nginx 60s 的活不要放在请求链路里。
- **worker 不直连数据库。**只能通过 `/api/worker/jobs*` 与站点交互，鉴权用 `INTERNAL_API_KEY`。
- **失败要留痕。**worker 失败必须回填 `status: "failed"` 与可读的 `error`，
  站点把它显示在页面上并给「重试」，不要静默重试到死。
- **识别语言必须与原声一致。**`ASR_LOCALE` 选错输出是乱码，不是「效果差一点」。
- **不用 `faster-whisper` / ctranslate2。**依赖 glibc，服务器是 musl 时导入即段错误；统一用 whisper.cpp。

### 前端

- 颜色只在 `src/app/globals.css` 的 `:root` / `.dark` 里成对定义，
  组件里禁止 `#hex`、`bg-white`、`text-black`；品牌色用 `text-brand-red`。
- 任何前端改动都要**浅色 + 深色**各看一遍。
- 正文渲染走 MDX，样式集中在 `.prose-reading`，不要在每个组件里零散写排版。

### 提交规范

- Conventional Commits + 中文描述，单行：`feat(收藏): 支持重复链接合并标签`、`fix(worker): 转写失败时保留原因`。
- 一个提交只做一件事；分支持续保持 `main`。

## 必须测试

改完不得直接结束：

1. `pnpm typecheck` 必须通过；
2. 构建只在部署器内跑：`bash scripts/deploy.sh deploy`（`sh` 会因 `set -o pipefail` 报错；
   只验能否编译用 `bash scripts/deploy.sh build_only`）。**禁止在仓库里裸跑 `pnpm build`**——
   Next 会先清 `.next`，线上立刻白屏；
3. 动了 Prisma schema：本地 `pnpm db:migrate` 能跑通，且新迁移文件一起提交；
4. 动了 worker：`python3 -m py_compile worker/*.py`，并用 `python3 worker/worker.py --dry-run` 验证能领到任务；
5. 动了收藏/状态/重试等核心流程，手动跑一遍：收藏 → 等抓取 → 打开详情 → 标已读。

## 目录约定

```
src/app/       页面与路由（App Router）
src/actions/   Server Actions，一个业务域一个文件
src/components/页面组件；ui/ 下是 shadcn 风格原子组件
src/lib/       Prisma 客户端、会话、鉴权、工具
prisma/        schema 与迁移
worker/        Python 抓取 / 转写 worker（独立进程）
docs/          架构与设计说明
```

## 部署

```bash
cd ~/gxwtf_reading
git pull && git status --short          # 必须干净：部署器 rsync 磁盘内容，未提交改动也会上线
bash scripts/deploy.sh log | tail -3    # 看 30 分钟内有没有别人在部署（部署器没有 flock）

# schema 有变更时：先迁移、再部署，且迁移必须向后兼容（删列/改类型分两次发布）
pnpm exec prisma migrate deploy

bash scripts/deploy.sh deploy           # 构建 → 快照 → 切换 → 重启 → 冒烟；失败自动回滚

# 动了 worker/*.py 才需要（部署器只重启 gxreading，不含 worker）
sudo -n systemctl restart gxreading-worker.service
journalctl -u gxreading-worker -n 20 --no-pager   # 无 traceback
```

- 数据库：`gxwtf_reading`（独立库，不要塞进 `gxwtf_writing`）
- systemd：`gxreading.service`（3005）、`gxreading-worker.service`
- Nginx 需透传 `Host` 与 `X-Forwarded-Proto`（SSO 的 `system` 取 Host）
- 上线前：广学账号侧把 `reading.gxwtf.cn` 加进 system 白名单

## 开发流程：Goal → Agent → 审查（强制）

凡是要改代码的任务，三段走完才算完成。跳过第一步会做错方向，跳过第三步会把
「typecheck 过了」当成「功能对」。

### 1. Goal：先定验收，再动代码

开工前一句话说清四件事，说不清就先别写：

| 项 | 要求 | 反例 |
| --- | --- | --- |
| 目标 | 一句话，动词开头 | 「优化一下搜索」 |
| 验收标准 | 可观测、能当场跑或点 | 「性能更好」 |
| 边界 | 明确不做什么 | （没写 → 必然蔓延） |
| 失败形态 | 出错时用户看到什么 | （不写 → 静默失败） |

验收标准优先写成**能跑的断言**：`pnpm test` 的某条用例、某个 curl 的状态码、某次
`cmp` 的字节一致。写不出断言说明还没想清楚。

**先量再定优先级。** 本项目规模很小（2026-11 实测：Entry 31 条、总内容 47KB、
搜索单次查询 0.27ms），照 ROADMAP 的旧描述决定先做「全文检索」是错的——那个量级
谈性能没有意义，真问题通常在正确性（卡死任务回收、失败静默、越权）。

### 2. Agent：按补丁尺寸派活

**先写补丁，再决定谁做**。补丁 = 文件 + 「原字符串 → 新字符串」。

| 情形 | 谁做 |
| --- | --- |
| ≤1 文件且 ≤5 行、无行为变化（文案/格式） | 自己做，跳过 Goal 文件 |
| ≥2 文件 或 ≥20 行 | 派 agent |
| 写不出补丁（要先探索才知道改哪） | 派 agent，让它先出补丁再改 |

派单必须是补丁式：目标 + 文件 + 验收断言 + 禁止事项 + `Goal:` 路径。禁止「你先探索一下」。

命令别混：本机子 agent 用 `Agent` 工具（当前唯一可用）；`minis-cloud agent` 是云端，**本机没装**（无 `minis_cloud.py`、agent-cloud 无 token，见 CLAUDE.md §8）。

独立子任务才并行（改不同文件、不共享状态）；共享 schema 或同一文件的串行做。单提交 ≤5 文件 / ≤200 行 diff。

### 3. 审查：必须换视角

1. **派独立 agent 审**，不是自己重读——「换个心态重读」等于没换人。
2. 对照第一段的**断言**审，不是对照代码好不好看。
3. **结论只能三选一**：通过 / 不通过（附原因）/ 不通过但已豁免（附理由）。
   产物用 **Edit** 追加到任务文件（非交互会话里 `Write(path)` 权限规则会被忽略）。
4. 必问四题：
   - 失败时用户看到什么？会静默失败吗？
   - 边界：空 / 超长 / 并发 / 越权 / 别人的 id？
   - **有没有第二处同样的逻辑**？（本项目最高频的 bug：`retryFetch` 与
     `ingest.ts` 各写一遍任务分类，其中一处写错，PDF 重试被排成转写。
     现在统一走 `src/lib/url.ts` 的 `jobKindFor()`。）
   - 改动真的生效了吗？构建产物里有吗、服务重启了吗、**节流/缓存会不会把测试骗过去**？
     （实例：回收卡死任务的 5 分钟节流，被 worker 每 5 秒的轮询提前吃掉，
     导致手动 curl 测不出效果。测这类逻辑要先 `systemctl stop` worker。）

### 4. 收尾：验证必须跑

| 改动 | 最低验证 |
| --- | --- |
| 纯函数 / 规则 | `pnpm test`，关键分支各一条 |
| 接口 | 真实 curl：正常 + 未登录 + 越权 + 非法输入。要登录态先铸 cookie（见下） |
| 前端 | typecheck 不够。本机 Windows 用 Chrome/Edge 打开线上点一遍并截图（服务器没 Playwright） |
| schema | `prisma validate` → `migrate deploy` → 查表结构；删列/改类型分两次发布 |
| 部署 | `bash scripts/deploy.sh deploy`（`sh` 会报 `Illegal option -o pipefail`），冒烟全绿，确认回滚点 |

报完成时给三件套：改了什么 / 为什么 / **怎么验证的（贴实际输出）**。没测的部分点名说。

**要登录态怎么造**（`/tmp` 下解析不到 `node_modules`，必须在仓库目录跑）：

```bash
cd ~/gxwtf_reading && cat > ./mint-tmp.mjs <<'EOF'
import { sealData } from "iron-session";
import fs from "node:fs";
const env = fs.readFileSync(".env", "utf8");
const pw = /^SECRET_COOKIE_PASSWORD=(.*)$/m.exec(env)[1].replace(/^"|"$/g, "");
console.log(await sealData({ isLoggedIn:true, userId:2691, userName:"t", admin:0, email:"", realName:"", grade:12, counter:0, version:"senior" }, { password: pw, ttl: 900 }));
EOF
node ./mint-tmp.mjs; rm -f ./mint-tmp.mjs
# 用法：curl -H "Cookie: gxreading_session=<输出>" http://127.0.0.1:3005/api/...
```

**断言要带具体路径**：未登录访问 `/api/dav/me` 是 401，但 `/books` 是 200、`/s/__nope__` 是 404——泛写「未登录 → 401」会产出跑不通的验收。

**部署后观察期（5 分钟）**：`smoke.sh` 只看三个未登录页，对本次改动零信息量。补：

```bash
journalctl -u gxreading -n 50 --no-pager | grep -iE 'error|traceback'   # 无新错误
curl -s localhost:3005/api/health                                       # db: up
bash scripts/deploy.sh log | tail -1                                    # 记录落地
```

**未实测不是终态**：登记进任务文件，写清复测人和日期，不能凭一句「没测」结项。

## 新增功能的路由表

改哪类东西、去哪改、怎么验，照这张表走：

| 改动 | 改哪里 | 验证 |
| --- | --- | --- |
| 条目类型 / 任务分类 | `src/lib/url.ts`（`detectKind` / `jobKindFor`） | `ingest.test.ts` |
| 抓取队列状态机 | `src/app/api/worker/jobs/route.ts`（领取 + 回收） | 造卡死任务实测，见下 |
| 附件 / 图片 | `src/lib/attachments.ts` + `src/lib/image-sniff.ts` | `attachments.test.ts` + 真实上传 |
| 正文渲染 | `src/app/entry/[id]/page.tsx` 的 MDXRemote `components` | 浅色 + 深色各看一遍 |
| 分享页 | `src/app/s/[token]/page.tsx` | 无登录态下 curl，图片要走 `?share=` |
| 抓取 / 转写逻辑 | `worker/*.py` | `py_compile` + `--dry-run` + **重启 worker** + `journalctl -u gxreading-worker -n 20` 无 traceback |
| 数据库结构 | `prisma/schema.prisma` + 新迁移目录 | `prisma validate` 先跑，再 `migrate deploy` |

### 队列回收的测法（别被节流骗了）

```bash
cd ~/gxwtf_reading && set -a && . ./.env && set +a   # DATABASE_URL / INTERNAL_API_KEY 只在这里
sudo -n systemctl stop gxreading-worker        # 它每 5 秒轮询，会提前吃掉 5 分钟节流窗口
sudo -n systemctl restart gxreading            # 重置模块级 lastReclaimAt
psql "$DATABASE_URL" -c "INSERT INTO \"FetchJob\" (url,kind,status,attempts,\"claimedAt\",\"createdAt\",\"updatedAt\")
  VALUES ('https://probe/x','fetch','running',1, NOW() - INTERVAL '3 hours', NOW(), NOW());"
curl -s -H "Authorization: Bearer $INTERNAL_API_KEY"   "http://127.0.0.1:3005/api/worker/jobs?worker=probe"
psql "$DATABASE_URL" -c "select status,attempts from \"FetchJob\" where url='https://probe/x';"
# 期望：attempts<3 → pending；attempts>=3 → failed 且 Entry 也 failed
sudo -n systemctl start gxreading-worker
```

## 未来规划

- 标签页与分组管理页
- 全文搜索（Postgres 全文索引）
- 划线批注交互
- 浏览器书签脚本 / iOS 分享扩展
- 旧 Obsidian 库的一次性导入脚本（Markdown → Entry）

## 媒体与第三方播放器（2026-11 补）

- B 站/YouTube 的内嵌 iframe **读不到播放状态**，只有 YouTube 有官方 IFrame API；
  所以「暂停即停滚动」这类精确联动必须走**本地 mp4 + 原生 `<video>`**。
- 精确播放的产物放在 `~/reading-media/<entryId>.mp4`，由 `/api/media/<id>/file` 提供 Range 流；
  准备任务走 `POST /api/media/<id>/prepare`，状态写在 `Entry.mediaState`。
- B 站直链（`yt-dlp -g`）是 DASH 分片（`.m4s`），**不能直接丢给 `<video>`**；
  要长时间播放只能本地转码或接 DASH 播放器。
- 服务端直链代理必须补 `Referer: https://www.bilibili.com/` 与浏览器 UA，否则 CDN 返回 403。
- iPad/iPhone 对本地流式 mp4 兼容性差：`VideoReader` 会在 iOS 上自动回退内嵌播放器。
- 逐字稿/歌词行用显式 CSS 类（`.tr-line` / `.tr-line-active`），不要用 `bg-xxx/15`
  这类任意透明度，Tailwind 可能不生成。
