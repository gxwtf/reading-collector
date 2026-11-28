# 2026-11-28 移除书库 + PDF 原样查看

## 目标

删掉「书库」整套功能（页面 / API / WebDAV / worker 脚本 / 数据表 / 文件），
并给 PDF 条目加原文查看器。

## 已确认的前提（2026-11-28 与用户确认）

| 项 | 结论 |
| --- | --- |
| 书库放弃深度 | **连数据库表和文件一起删**（不可逆，已备份） |
| PDF | 要加原样查看 |
| 书库数据 | 直接删（已备份到 `~/backups/reading-library-20261128-114323/`） |

## 现状基线（2026-11-28 实测）

| 项 | 值 |
| --- | --- |
| 书库代码 | 24 个文件 / 1151 行（`src/app/books*`、`src/app/readest-*`、`src/app/api/books/*`、`src/app/api/v1/*`） |
| 书库 lib | `src/lib/readest.ts` 198 行、`src/lib/dav-users.ts` 45 行 |
| 书库组件 | `BookUploader.tsx` 88 行、`ReadestSetup.tsx` 69 行 |
| worker 脚本 | 8 个（enrich_* / publish_readest / prune_* / sync_* / webdav / cleanup_library） |
| 线上数据 | Book 11 条 / BookAnnotation 0 / BookBookmark 0 / ReadingSession 0 |
| 线上文件 | `~/reading-books` 101MB（打包后 86MB） |
| 服务 | `gxreading-dav`（Readest WebDAV 书库）active |
| 备份 | `~/backups/reading-library-20261128-114323/`（5 个文件，86MB） |

## 断言（每条都必须实跑并贴输出）

### 书库移除

| 断言 | 命令 / 操作 | 期望 |
| --- | --- | --- |
| 导航无「书库」 | 打开 `/` | 顶部导航只有 全部/未读/收藏/批注 |
| `/books` 不再可用 | `curl -o /dev/null -w '%{http_code}' localhost:3005/books` | 404 |
| `/readest-setup` 不再可用 | 同上 | 404 |
| `/api/books/upload` 不再可用 | POST 同上 | 404 |
| `/api/v1/books` 不再可用 | `curl` 同上 | 404 |
| 设置页不再提 WebDAV 书库 | 打开 `/settings` | 无「书库同步」小节、页面 200 |
| 数据表已删 | `psql -c "\dt" \| grep Book` | 无输出 |
| 书库文件已删 | `ls ~/reading-books` | 不存在 |
| `gxreading-dav` 已停 | `systemctl is-active gxreading-dav` | `inactive` |
| typecheck | `pnpm typecheck` | 0 error |
| 构建 | `next build` | 成功 |
| 收藏流程不受影响 | e2e `smoke.mjs` | 10/10 通过 |

### PDF 原样查看

| 断言 | 命令 / 操作 | 期望 |
| --- | --- | --- |
| PDF 条目有查看器 | 打开 `kind=document` 且 URL 以 `.pdf` 结尾的条目 | 出现 `iframe` 或 `<object>`，指向本站代理路由 |
| 代理路由鉴权 | 未带 cookie `curl /api/pdf/<id>` | 401 |
| 代理路由本人可用 | 带 cookie `curl /api/pdf/<id>` | 200 且 `content-type: application/pdf` |
| 越权拦截 | 带 A 的 cookie 请求 B 的条目 | 404 |
| 非 PDF 条目不受影响 | 打开文章/视频条目 | 无 iframe，正文照常 |
| 小屏不溢出 | 390px | `scrollWidth <= clientWidth + 1` |
| 不改原有正文 | PDF 条目的「抽出的文字」仍在（可搜索/划线） | `.prose-reading` 存在且有内容 |

## 失败文案

| 场景 | 用户看到 |
| --- | --- |
| 访问已删的 `/books` | Next 默认 404 页（「找不到这条内容」） |
| PDF 代理：未登录 | 401（JSON `{"error":"unauthorized"}`） |
| PDF 代理：不是自己的条目 | 404 |
| PDF 文件在磁盘上丢了 | 「PDF 原文件不在了」+ 提示去原站看 |
| 扫描件（无文字层） | 沿用现有「PDF 里抽不到文字（可能是扫描件）」 |

## 边界

**做**
- 删 24 个书库前端/API 文件、2 个 lib、2 个组件、8 个 worker 脚本
- 删 Prisma 里 `Book` / `BookAnnotation` / `BookBookmark` / `ReadingSession` 四个 model 与迁移（新增一个 drop 迁移）
- 删 `~/reading-books` 目录、停用并删除 `gxreading-dav` 服务
- `/settings` 去掉 WebDAV 书库小节；`sso/callback` 去掉 `ensureDavUser` 调用
- 新增 `/api/pdf/[id]` 代理（鉴权 + Content-Type + Range 支持），详情页给 PDF 条目嵌 `<object>`/`<iframe>`

**不做**
- 不做书库的数据迁移（用户明确要删）
- 不改 `Entry` / `Highlight` / `Collection` 等收藏相关表
- 不碰 `gxobsidian-dav`（那是 Obsidian vault，与书库无关）
- 不删 README/HANDOFF 里的历史描述（另开文档提交）

**风险与对策**
- 删表不可逆 → 已全量备份（数据 + schema + 文件 + 代码 + systemd 单元）
- `readest.ts` 被 17 个 `/api/v1/*` 路由共用 → 这些路由一起删，不留孤儿引用
- `dav-users.ts` 被 `settings/page.tsx` 与 `sso/callback` 引用 → 两处都要改，否则登录 500

## 分步

1. 备份（已完成）
2. 删前端页面 + 组件 + 导航入口
3. 删 `/api/books/*` 与 `/api/v1/*`
4. 改 `/settings` 与 `sso/callback`
5. Prisma：删 4 个 model + 生成 drop 迁移
6. 删 worker 脚本
7. PDF 代理路由 + 详情页查看器
8. 部署 + 删线上数据表/文件 + 停服务
9. 独立 agent 审查

## 提交拆分

1. `feat(pdf): 详情页支持原样查看 PDF`
2. `refactor(书库): 移除书库功能（页面/API/worker/schema）`
3. `chore(docs): 记录移除原因与备份位置`

## 实测记录（2026-11-28 本机实跑）

环境：Windows 11 + 临时 PostgreSQL（55432）+ `next build` + `next start -p 3005`，
登录态用 iron-session 现铸。

### 书库移除

| 断言 | 实测 | 结果 |
| --- | --- | --- |
| 导航无「书库」 | 截图里导航只剩 全部/未读/收藏/批注 | 通过 |
| `/books` | `404` | 通过 |
| `/readest-setup` | `404` | 通过 |
| `/readest-boot` | `404` | 通过 |
| `/api/books/upload` | `404` | 通过 |
| 设置页不再提 WebDAV | `settings=200`，正文不含「书库同步」「WebDAV」，模型设置仍在 | 通过 |
| 数据表已删 | `information_schema` 只剩 13 张业务表 + `_prisma_migrations`，无 `Book*` | 通过 |
| `prisma validate` | `The schema ... is valid` | 通过 |
| typecheck | 0 error | 通过 |
| 构建 | `✓ Compiled successfully` | 通过 |
| e2e 回归 | 10 通过 / 0 失败，退出码 0 | 通过 |
| 残留引用 | `grep 'lib/readest|lib/dav-users|lib/anx|BookUploader|ReadestSetup'` 无命中 | 通过 |
| python 语法 | `py_compile worker/fetcher.py worker/worker.py` 退出码 0 | 通过 |

### PDF 原样查看

| 断言 | 实测 | 结果 |
| --- | --- | --- |
| 代理：未登录 | `401` | 通过 |
| 代理：本人可用 | `200` / `application/pdf` / 836 bytes | 通过 |
| 代理：Range | `206` + `content-range: bytes 0-99/836` | 通过 |
| 代理：别人的 id | `404`（不区分 403/404，避免探测是否存在） | 通过 |
| 详情页有查看器 | `object[type=application/pdf]` 1 个，`data="/api/pdf/9"`，794×560 | 通过 |
| 查看器真的渲染 | 截图里能看到浏览器内置 PDF 工具栏（页码 1/1、缩放、下载） | 通过 |
| 非 PDF 条目不受影响 | 打开 `entry/1`（文章），`object` 数量 = 0 | 通过 |
| 文字版仍在且可折叠 | `.prose-reading` 存在；PDF 条目的文字版收进 `<details>` | 通过 |
| 小屏不溢出 | `overflow = 0` | 通过 |
| 控制台无错误 | `errors: []` | 通过 |

### 过程中修掉的两个问题

1. **`underPdfDir` 在 Windows 上误判**：原来用字符串前缀 `PDF_DIR + "/"` 判断，
   Windows 路径是反斜杠，合法路径被当成越界 → 代理恒 404。改用
   `path.relative()`（跨平台、大小写不敏感）。
2. **查看器把正文挤出首屏**：`<object>` 原设 80vh，抽出的文字要滚很远才看得到。
   改成 70vh + 文字版收进 `<details>`，两边不争版面。

## 未实测（登记）

| 项 | 原因 | 复测 |
| --- | --- | --- |
| 线上真实 PDF（外链） | 本机只有自造的测试 PDF。真实 PDF 的 Content-Type / 重定向 / 大文件场景要在线上验 | 部署后投一个 arxiv 链接 |
| worker 落盘到 `/home/gxwtf/reading-pdfs` | 本机用 `PDF_DIR` 指向临时目录，验证了代码路径；生产目录权限要部署后确认 | 部署后 `ls ~/reading-pdfs` |
| 扫描件 | 无文字层仍会失败，这是设计如此（需要 OCR，未做） | 不属于本次范围 |

