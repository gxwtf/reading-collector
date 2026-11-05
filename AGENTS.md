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
2. `pnpm build` 必须成功（线上用 `next start`，构建脚本固定 `next build --webpack`）；
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
cd ~/gxwtf_reading && git pull
pnpm install
pnpm exec prisma migrate deploy
pnpm build
sudo /usr/local/sbin/gxwtf-systemctl restart gxreading.service
sudo /usr/local/sbin/gxwtf-systemctl restart gxreading-worker.service
```

- 数据库：`gxwtf_reading`（独立库，不要塞进 `gxwtf_writing`）
- systemd：`gxreading.service`（3005）、`gxreading-worker.service`
- Nginx 需透传 `Host` 与 `X-Forwarded-Proto`（SSO 的 `system` 取 Host）
- 上线前：广学账号侧把 `reading.gxwtf.cn` 加进 system 白名单

## 未来规划

- 标签页与分组管理页
- 全文搜索（Postgres 全文索引）
- 划线批注交互
- 浏览器书签脚本 / iOS 分享扩展
- 旧 Obsidian 库的一次性导入脚本（Markdown → Entry）
