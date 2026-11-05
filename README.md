# 阅读收集（reading-collector）

把散落各处的链接收进一个云端阅读库：贴一条链接，后台自动抓正文、转写音视频，剩下的就是读。

当前版本 **0.1.0**，骨架已可跑通：登录、收藏、任务队列、抓取/转写 worker、列表与详情页。

## 功能特性

- **收藏入库**：贴链接即入库，同一用户重复收藏同一链接不会重复抓取
- **异步抓取**：正文抽取交给后台 worker，页面不等；失败的条目会在页面上给出原因与「重试」
- **音视频转写**：B 站 / YouTube / 播客走 `yt-dlp` + `whisper.cpp`，逐字稿与分段一起存库
- **阅读状态**：未读 / 已读，抓取状态与阅读进度分开记录
- **标签**：收藏时可打标签，全局去重、按用户配色
- **深色模式**：跟随系统，语义色走广坊 VI 令牌（实验红 `#A31F24`）
- **广学账号 SSO**：与广坊其他站点同一套登录流程

> 数据全部存在 PostgreSQL。**不再依赖 Obsidian / Notion / 本地文件。**

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 框架 | Next.js 16（App Router）、React 19、React Compiler |
| 语言 | TypeScript 6 |
| 数据库 | PostgreSQL + Prisma 7（`@prisma/adapter-pg`） |
| 样式 / UI | Tailwind CSS 4 + shadcn 风格组件 + lucide-react |
| 会话 | iron-session 9（广学账号 SSO） |
| 内容渲染 | next-mdx-remote + remark-gfm |
| 主题 | next-themes（浅色 / 深色语义令牌） |
| 后台任务 | Python 3 worker（httpx + trafilatura + yt-dlp + whisper.cpp） |
| 包管理 | pnpm |

架构说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 快速开始

### 环境要求

- Node.js 20.9+
- pnpm
- PostgreSQL（本机 5432）
- Python 3.9+（仅 worker 需要）

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | PostgreSQL 连接串，库名 `gxwtf_reading` |
| `SECRET_COOKIE_PASSWORD` | 是 | iron-session 密钥，≥32 字符 |
| `GXACCOUNT_URL` | 是 | 广学账号中心地址 |
| `INTERNAL_API_KEY` | 是 | worker 回调密钥，站点与 worker 一致 |
| `READING_BASE_URL` | 否 | worker 访问站点的地址，默认 `http://127.0.0.1:3005` |
| `WHISPER_MODEL` | 否 | whisper.cpp 模型路径 |
| `ASR_LOCALE` | 否 | 识别语言，必须与原声一致 |

### 3. 初始化数据库

```bash
pnpm exec prisma migrate dev     # 仅允许 localhost
pnpm db:generate
```

### 4. 启动

```bash
pnpm dev        # http://localhost:3005
```

worker 另开一个终端：

```bash
cd worker
pip install -r requirements.txt
python3 worker.py
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 开发服务器（3005） |
| `pnpm build` | 生产构建（固定 `next build --webpack`） |
| `pnpm start` | 生产启动（3005） |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm db:generate` | 生成 Prisma Client |
| `pnpm db:migrate` | 本地迁移（仅 localhost） |
| `pnpm db:deploy` | 生产迁移 |

## 目录结构

```
reading-collector/
├── src/
│   ├── app/            # 页面与路由（App Router）
│   │   ├── api/worker/ # worker 领取任务 / 回填结果
│   │   ├── entry/      # 文章详情
│   │   ├── login/      # 登录页
│   │   └── sso/        # 广学账号 SSO 入口与回调
│   ├── actions/        # Server Actions（收藏、状态、重试）
│   ├── components/     # 页面组件与 shadcn 风格 UI
│   └── lib/            # Prisma 客户端、会话、鉴权
├── prisma/schema.prisma
├── worker/             # Python 抓取 / 转写 worker
└── docs/               # 架构与设计说明
```

## 数据模型概览

| 模型 | 说明 |
| --- | --- |
| `User` | 广学账号镜像，`userId` 唯一 |
| `Entry` | 一条收藏，`@@unique([userId, url])` 保证幂等 |
| `FetchJob` | 抓取 / 转写任务队列 |
| `Transcript` | 音视频逐字稿（含分段） |
| `Tag` / `EntryTag` / `TagConfig` | 标签与用户级配色 |
| `Collection` / `CollectionEntry` | 分组（待读 / 素材 / 外刊…） |
| `Highlight` | 划线批注 |

完整定义见 [prisma/schema.prisma](prisma/schema.prisma)。

部署细节（systemd、Nginx、worker、排错）见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 生产部署

服务器 systemd 服务名 `gxreading.service`（端口 `3005`，Nginx 反向代理 + HTTPS），
数据库 `gxwtf_reading`，worker 单独一个 `gxreading-worker.service`。

```bash
cd ~/gxwtf_reading
git pull
pnpm install
pnpm exec prisma migrate deploy
pnpm build
sudo /usr/local/sbin/gxwtf-systemctl restart gxreading.service
sudo /usr/local/sbin/gxwtf-systemctl restart gxreading-worker.service
```

> 构建脚本固定为 `next build --webpack`，不要改回默认的 Turbopack。
> SSO 上线前需要运维在广学账号侧把 `reading.gxwtf.cn` 加进 system 白名单。

## 测试

- `pnpm typecheck`：类型检查（改完必须过）
- `pnpm build`：生产构建（线上用 `next start`）
- worker：`python3 -m py_compile worker/*.py`

## 许可证

MIT · 广学五题坊（广学社技术组）· gxwtf@foxmail.com · 京ICP备2025107534号-1
