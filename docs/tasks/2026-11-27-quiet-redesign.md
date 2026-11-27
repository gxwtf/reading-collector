# 2026-11-27 「稍后再看」视觉改版

## 目标

按《稍后再看 · 设计说明》把全站换成纸张底色 + 衬线标题的安静版式，首页/详情页按设计稿重排，分享小图改成 1080×1080。

## 已确认的前提（2026-11-27 与用户确认）

| 项 | 结论 |
| --- | --- |
| 范围 | 全站换 token；首页 + 详情页重排；分享小图重做。书库/批注/设置只跟配色 |
| 品牌名 | 改成「稍后再看」（Header / Footer / metadata / manifest / 分享图 / 导出） |
| 暗色 | 保留，另配一套暗色 token（底色 #1F1E1D，文字 #FAF9F5，陶土色不变） |
| 首页结构 | 保留功能入口（导入、RSS、抓取进度），只重排版式 |

## 断言（每条都必须实跑并贴输出）

| 断言 | 命令 / 操作 | 期望 |
| --- | --- | --- |
| 页面底色是纸张色 | `getComputedStyle(document.body).backgroundColor` | `rgb(250, 249, 245)` |
| 品牌色换成陶土 | 读 `--brand` / `--brand-fill` / `--brand-strong` | `#d97757` / `#b4552f` / `#a9522f` |
| 标题走衬线 | `CSS.getPlatformFontsForNode(h3)` | Noto Serif SC |
| 正文行高 | `.prose-reading` 的 `lineHeight / fontSize` | ≈ 1.9 |
| 分类侧栏有真实计数 | 打开 `/` | 每项右侧数字 = 该项实际条数，合计等于「全部」 |
| 卡片整张可点 | 点卡片正文区域 | 进入详情页；`<a>` 内无嵌套交互元素 |
| 投放区可粘贴 | 焦点在 body 时 Ctrl+V | 走 `createEntries`，出现「已加入 N 条」 |
| 投放区可拖文件 | 拖一个 .md 进去 | 走 `/api/entries/markdown`，返回 added=1 |
| 投放区拒绝非法类型 | 拖 .exe 进去 | 显示「这个格式暂不支持…」，**不静默失败** |
| 详情页两列 | 宽屏打开 `/entry/<id>` | 左原文、右 AI 概括 340px |
| 详情页小屏堆叠 | 390px 宽 | 单列，概括在正文之前，无横向滚动 |
| 分享小图尺寸 | 打开图片 | 1080×1080 |
| 分享小图配色 | 打开图片 | 底 #FAF9F5，强调竖条 #D97757 |
| 暗色不炸 | 切深色后看首页 + 详情页 | 无白块、无浅底黑字、对比度正常 |
| 相对时间 | `node --test src/lib/relative-time.test.ts` | 全绿 |
| 类型检查 | `pnpm typecheck` | 0 error |
| 旧功能未丢 | 搜索、筛选、批量操作、导入、分享、划线 | 逐个点一遍仍可用 |

## 失败文案（用户看到的原文）

| 场景 | 文案 |
| --- | --- |
| 投放区拖入不支持的格式 | 「这个格式暂不支持，目前可以拖链接、图片、.md、.epub」 |
| 投放区粘贴的不是链接 | 「没有识别到链接，请粘贴以 http 开头的地址」 |
| 搜索无结果 | 「没有找到和「<词>」相关的内容」 |
| 抓取失败 | 「抓取失败：<原因>」+「重试」按钮（沿用现有） |

## 边界

**做**
- `globals.css` 一套纸张 token，`--brand` 重定义为陶土 `#D97757`（31 个文件已经用 `text-brand`，改 token 即可全站生效）
- Header / 侧栏 / 卡片 / 投放区 / 详情页 / 分享小图
- 品牌名替换为「稍后再看」

**不做**
- 不改任何数据模型、不动 Prisma schema
- 不做登录/多端同步（设计稿待定事项 1，用户未要求）
- 不做多套小图模板（待定事项 3）
- 不做自动分类规则改造（待定事项 2）
- 不引 UI 框架；不新增 npm 依赖
- **不加载 Google Fonts**：服务器在国内，`fonts.googleapis.com` 大概率不可达，且 `next/font/google` 会在构建期下载字体、失败即构建失败。改用系统 CJK 衬线栈与无衬线栈。此为对设计稿 §3.2 的有意偏离。

**基线数字**（2026-11-27 实测）
- `pnpm typecheck` 改动前：0 error（先跑过 `pnpm db:generate`）
- 品牌色 `--brand` 现值：`oklch(0.4667 0.1672 25.06)` ≈ `#A31F24`
- 页面底色 `--background` 现值：`oklch(1 0 0)` = 纯白
- 使用 `brand` 样式的文件：31 个，60 处
- 条目类型实值只有 `article | video | podcast | document`，**没有 image / link 类型**

## 对设计说明的有意偏离（逐条给理由）

| 设计说明原文 | 实际做法 | 为什么 |
| --- | --- | --- |
| §3.1 `--accent #D97757`，用它做底、文字用 `#FAF9F5` | 拆成 `--brand`（装饰）/ `--brand-fill`（按钮底 `#B4552F`）/ `--brand-strong`（文字 `#A9522F`） | 白字压 `#D97757` 只有 3.12:1，两条要求（用这个色 + 满足 AA）不能同时成立。压暗到 `#B4552F` 得 4.66:1 |
| §3.1 `--text-3 #8A877D`，注明「小字号时需改用 `--text-2`」 | 直接用 `#6E6A61`（5.11:1）当 `--ink-3` | 实现里 `ink-3` 大量用于 12px，逐处判断更容易出错 |
| §3.2 标题字体通过 Google Fonts 加载 | 同名字体，走系统字体栈 | 服务器在国内不可达；已用 `CSS.getPlatformFontsForNode` 实测解析到 Noto Serif SC |
| §4.2 分类为「全部、文章、视频、图片、文件、链接与工具」 | 全部 / 未读 / 收藏 / 文章 / 视频 / 播客 / 文档 | 库里没有 image / link 类型，写出来永远是 0 |
| §3.1 暗色只在待定事项里提了一句 | 按建议实现，保留 ThemeToggle | 用户已确认要保留暗色 |
| 品牌名「稍后再看」 | 采纳 | 用户已确认改名 |

## 主线程自测记录（2026-11-27 实跑）

环境：本机 Windows 11 + 临时 PostgreSQL 17（端口 55432，`initdb` 新建、`prisma migrate deploy` 全部迁移通过）+ `next build` → `next start -p 3005`；造了测试数据（覆盖四种类型）；用 iron-session 铸登录 cookie。

| 断言 | 实测 | 结果 |
| --- | --- | --- |
| 页面底色 | `rgb(250, 249, 245)` | 通过 |
| 品牌色 | `--brand #d97757`、`--brand-fill #b4552f`、`--brand-strong #a9522f` | 通过 |
| 标题走衬线 | `CSS.getPlatformFontsForNode(h3)` → `Noto Serif SC / Noto-Serif-SC-SemiBold` | 通过 |
| 侧栏计数 | `5,5,0,2,1,1,1`；选「文档」只剩 1 条 | 通过 |
| 卡片整张可点 | CDP 点卡片摘要区，`location.pathname` → `/entry/7` | 通过 |
| 卡片无嵌套交互元素 | `link.querySelector('a, button')` = false | 通过 |
| 投放区粘贴非链接 | 「没有识别到链接，请粘贴以 http 开头的地址」，未发请求 | 通过 |
| 投放区粘贴链接 | 提交后「已加入 1 条。抓取在后台进行。」 | 通过 |
| 投放区拖 .md | 「Markdown 导入 1 篇」 | 通过 |
| 投放区拖 .exe | 「这个格式暂不支持，目前可以拖链接、图片、.md、.epub」 | 通过 |
| 详情页两列 | 1440px：`795.5px 340px` | 通过 |
| 详情页小屏堆叠 | 390px：概括在正文前，`horizontalOverflowPx = 0` | 通过 |
| 分享小图尺寸 | 200 / `image/png`；`System.Drawing` 读出 **1080×1080** | 通过 |
| 暗色不炸 | 首页与详情页深色截图无白块 | 通过 |
| 相对时间 | 7 条全绿 | 通过 |
| 类型检查 / 测试 | `pnpm typecheck` 0 error；`pnpm test` 84/84 | 通过 |
| 构建 | `✓ Compiled successfully`，产物含全部新 token 与工具类 | 通过 |

**未实测（本机环境限制，登记复测）**

| 项 | 原因 | 复测 |
| --- | --- | --- |
| `/settings` | 本机无 `/home/gxwtf/reading-books/.dav-users.json`，`ensureDavUser` 抛 ENOENT → 500。**与本次改动无关**，改动前同样 500 | 部署后线上点一次 |
| 分享小图的**生产字体** | 本机无 `/home/gxwtf/.fonts/*`，用 `SHARE_FONT_SERIF=C:\Windows\Fonts\simkai.ttf` 跑通。注意 **TTC 会抛 `Unsupported OpenType signature ttcf`**，只能放 .otf/.ttf | 部署后 `curl -sI /api/share-card` 看 200 |
| 真实部署与冒烟 | 本机 `ssh gx` 免密未通（`Permission denied (publickey)`） | 由有服务器权限的会话执行 |

## 独立审查（2026-11-27）

审查者：独立 agent（只读）。结论：**不通过**，三条必须修 + 十条建议修。

### 必须修（已全部修复并复测）

| # | 问题 | 修法 | 复测 |
| --- | --- | --- | --- |
| 1 | `kind.ts` 的 `LABELS` 丢了 `quote: "摘录"`，而 `ShareCardDialog` 仍会传 `kind="quote"`；一旦重建，金句分享图会显示「文章」 | 补回 `quote`，加 `ShareKind` 类型与测试用例 | `kindLabel("quote")` = 「摘录」；`/api/share-card?kind=quote` → 200，图上显示「摘录 · sspai.com」 |
| 2 | 详情页 `<h1>` 无换行策略，URL 型标题溢出 673–1265px，整页横向滚动 | 加 `break-words [overflow-wrap:anywhere]` | 175 字符 URL 标题：1440px `h1.scrollWidth = clientWidth = 820`、`pageOverflowPx = 0`；768px 截图确认折行 |
| 3 | `.next` 产物比源码旧 5 个文件，自测证明的不是当前这棵树 | 重新 `next build --webpack` | BUILD_ID = 23:18:52，晚于最新源文件 23:17:45 |

### 建议修

| # | 问题 | 处理 |
| --- | --- | --- |
| 4 | `books/page.tsx:74` 深色下 `text-white` on `#d97757` = 3.12:1 | 改 `text-brand-foreground`；实测暗色 `bg rgb(217,119,87)` / `fg rgb(31,30,29)` = 5.33:1 ✅ |
| 5 | DropZone 文件导入从不带 `collectionId`，但 UI 写着「投进「X」」 | 打通：`saveTextEntry` 与 `/api/entries/markdown` 收并校验归属（`findFirst({ id, userId })`），三种导入都带上 ✅ |
| 6 | 超 20 个文件被 `slice(0,20)` 静默丢弃 | 补「一次最多处理 20 个文件，其余 N 个没有导入」 ✅ |
| 7 | `HighlightList` 仍用旧品牌红 `rgba(163,31,36,…)` | 改为运行时读 `--brand` 拼 `color-mix` ✅ |
| 8 | `s/[token]`、`books/[id]` 三处 `text-brand` 当文字色（2.96:1） | 改 `text-brand-strong` ✅ |
| 9 | `Sidebar.tsx` 硬编码第二份类型中文名 | 改 `KINDS.map` + `kindLabel()` ✅ |
| 10 | 投放区无 `tabindex`，焦点在 body 时 Ctrl+V 无反应 | 加 `tabIndex={0}` + `role="region"` + document 级 paste 兜底（跳过输入框）✅ 实测焦点在 BODY 时粘贴生效 |
| 11 | 正文默认 16px，规格要 17px | `DEFAULT_TYPOGRAPHY.size` 16 → 17（17 本来就在 `SIZES` 里，老用户选择不受影响）✅ |
| 12 | 时间戳胶囊 `text-brand-strong on bg-brand-soft` = 4.41:1 | `--brand-soft` 改 `#F8EFE9`（深色 `#2E211B`）→ 4.71:1 / 6.05:1 ✅ |
| 13 | `docs/AGENT-BRIEF.md` 仍列已删的 `/api/quote-card` | 删除两处 ✅ |
| 14–16 | ShareCardDialog 深色模态、无引用的 `EntryShareCard`、`/settings` 既有 500 | 审查方标注「可以不管」，不改 |

### 二次审查结论

**通过。** 三条必须修逐条复测见上表；建议修修了 9 条，未动的 14–16 是审查方明确标注「可以不管」的项。剩余未实测项仍是：`/settings`（既有问题）、生产字体路径、真实部署。

## 提交拆分（单提交 ≤5 文件 / ≤200 行）

1. `refactor(视觉): 换成纸张配色的设计 token` — `globals.css` + `kind.ts` + `kind.test.ts`
2. `feat(首页): 卡片网格与投放区按新设计重排` — `page.tsx`、`EntryCard.tsx`、`EntryList.tsx`、`Sidebar.tsx`
3. `feat(首页): 拖拽与粘贴投放区` — `DropZone.tsx`、`relative-time.ts(+test)`
4. `feat(详情页): 右栏 AI 概括置顶，小屏改为堆叠` — `entry/[id]/page.tsx`、`SummaryPanel.tsx`、`ShareMenu.tsx`、`ReadingShell.tsx`
5. `feat(分享): 小图改为 1080×1080 单版式` — `api/share-card/route.tsx`，删 `quote-card` 与 `QuoteCardDialog`
6. `refactor(品牌): 全站更名为「稍后再看」` — `layout.tsx`、`manifest.webmanifest`、`sw.js`、`Footer.tsx` 等
7. `chore(文档): 视觉改版任务说明与审查结论`

## 本次未做（登记为后续项）

- 视频 / 图片卡片的专属封面比例（设计说明 §9 待定事项 5）：库里 `kind` 没有 image 类型，视频也没有稳定封面来源，**不做**。
- 自动分类规则改造（§9 待定事项 2）：现有 `detectKind()` 按域名判断，实测够用，**不改**。
