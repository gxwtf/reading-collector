# 2026-11-28 前端自动化验证能力

## 目标

让前端改动能被自动化验证，取代「服务器没 Playwright，所以只能人肉看」这个（已被证伪的）借口。

## 前置事实（2026-11-28 实测）

| 项 | 实测结果 |
| --- | --- |
| `/usr/bin/microsoft-edge` | Edge **158.0.4370.33** 真二进制（symlink → /etc/alternatives），**不是 snap 壳** |
| npm registry | HTTP 200，可装依赖 |
| `playwright-core@1.65.1` | 装在 `~/e2e-tools`，**成功驱动 Edge 打开页面** |
| 现有 UI 测试 | 0 个（7 个测试文件全是纯函数） |

结论：「不能自动化验前端」是错的。不需要下载浏览器，用系统已有的 Edge 即可。

## 断言

| 断言 | 命令 | 期望 |
| --- | --- | --- |
| 驱动可用 | `node scripts/e2e/smoke.mjs` | 退出码 0，输出每项 OK |
| 登录态可注入 | 同上 | 能带 cookie 进入 `/`，URL 不是 `/login` |
| 布局基线 | 同上 | `/` 卡片数 > 0，无横向溢出 |
| 排版面板可开 | 同上 | 点「排版」后出现 `role=dialog` |
| 字号切换生效 | 同上 | 点 A+ 后 `.prose-reading` 的 computed fontSize 变大 |
| 字体切换生效 | 同上 | 选「宋体」后 computed fontFamily 含 `Songti`/`SimSun`/`serif` |
| 搜索高亮生效 | 同上 | 带 `?q=` 进入，`CSS.highlights` 里有区间，且 DOM 未被改写 |
| 深色模式无白块 | 同上 | `html.dark` 下 `.prose-reading` 背景不是近白 |
| 移动端 390px 不溢出 | 同上 | `documentElement.scrollWidth <= clientWidth + 1` |
| 截图落盘 | 同上 | `~/e2e-shots/<日期>/` 下有 png，非空 |

## 失败文案

| 场景 | 用户看到 |
| --- | --- |
| Edge 不存在 | 脚本输出 `Edge 未找到：/usr/bin/microsoft-edge`，退出码 2 |
| 服务未启动 | 输出 `健康检查失败`，退出码 3 |
| 某项断言失败 | 输出 `✗ <项名>：<实际值>`，退出码 1；截图保留便于排查 |

## 边界

**做**
- 用系统 Edge，不下载浏览器（`playwright-core` 而非 `playwright`）
- 工具装在 `~/e2e-tools`（独立目录），脚本放仓库 `scripts/e2e/`，依赖不进 `package.json`
- 覆盖：登录、列表、详情、排版面板、搜索高亮、深色、390px
- 生成截图，便于人工复核

**不做**
- 不引 Playwright Test 框架（`@playwright/test`），只用 `playwright-core` 的裸 API——少一层依赖
- 不做视觉回归（像素比对），只做可断言的属性检查
- 不覆盖视频播放（需要真实媒体流）
- 不改 `package.json`（避免为一个工具动生产依赖）

**基线数字**
- 服务端口 3005，健康检查 `/api/health` 返回 `{"ok":true,"db":"up"}`
- 有内容的条目 id=67（4495 字，87 行）
- 会话 cookie 名 `gxreading_session`，`SECRET_COOKIE_PASSWORD` 在 `.env`

## 拆分

| 谁 | 产物 |
| --- | --- |
| 主线程 | `scripts/e2e/lib.mjs`（启动浏览器、注入 cookie、断言 helper） |
| agent | `scripts/e2e/checks.mjs`（具体检查项，纯函数式，接收 page 返回结果） |
| 主线程 | `scripts/e2e/smoke.mjs`（入口，串起来、退出码、截图） |

## 实施结果（2026-11-28 实跑）

**补完的部分**：任务书里 `checks.mjs` 一直是缺的（`smoke.mjs` 引用了它但文件不存在），本次补齐
并在本机 Windows + Edge 158 上真跑通。

**本机适配**（原脚本写死了 Linux 路径）：
- `lib.mjs` 的 Edge 路径改成候选列表，同时认 `/usr/bin/microsoft-edge` 与 Windows 两个默认路径
- `EDGE_PATH` 一旦显式指定就**只用它**，找不到直接退出码 2，不回退——不然「测的到底是不是我指的浏览器」说不清
- `rm -f` 换成 `rmSync(..., { force: true })`：Windows 上 `rm` 不是可执行文件

**断言逐条实测**（`node scripts/e2e/smoke.mjs --entry=1`）：

| 断言 | 实测输出 | 结果 |
| --- | --- | --- |
| 驱动可用 | 退出码 0，10 项全 ✓ | 通过 |
| 登录态可注入 | `URL /，标题「稍后再看」` | 通过 |
| 布局基线 | `8 张卡片，横向溢出 0px` | 通过 |
| 排版面板可开 | `1 个 dialog 可见` | 通过 |
| 字号切换生效 | `17px → 18px` | 通过 |
| 字体切换生效 | `"Songti SC", "Noto Serif CJK SC", SimSun, STSong, serif` | 通过 |
| 搜索高亮生效 | `1 个区间，DOM 未插入标记` | 通过 |
| 深色模式无白块 | `body rgb(31, 30, 29)，亮度 30` | 通过 |
| 移动端 390px 不溢出 | `视口 390px，溢出 0px` | 通过 |
| 截图落盘 | `~/e2e-shots/2026-11-28/{entry-desktop,entry-mobile}.png`，98KB / 61KB | 通过 |

**失败分支实测**：

| 场景 | 实际输出 | 退出码 |
| --- | --- | --- |
| Edge 不存在（`EDGE_PATH=C:\nope\msedge.exe`） | `✗ Edge 未找到，试过：C:\nope\msedge.exe` | 2 ✓ |
| 服务没起来（`--base=http://127.0.0.1:39999`） | `✗ 健康检查失败…TypeError: fetch failed` | 3 ✓ |
| 有断言失败（调选择器阶段） | `✗ 字号切换生效  locator.click: Timeout…` | 1 ✓ |

**顺带修掉一个真漏洞**：`DEFAULT_TYPOGRAPHY.size` 上一轮说改成 17px，
但实际提交里还是 16px——独立审查第 11 条当时没真正落地，e2e 的「正文排版」
这一项把它抓了出来（`16px / 30.4px`）。改正后复测为 `17px / 32.3px = 1.90`。
这正是这条能力存在的意义：之前只靠人眼看，只能说「看起来差不多」。

## 已知限制

- 目前只覆盖 10 项，**不做像素级视觉回归**（见「不做」一节）
- 截图固定用 `entry=1`，换库/换账号要 `--entry=<id>`
- 依赖 `~/e2e-tools` 里的 `playwright-core`，换了机器要先装：
  `mkdir -p ~/e2e-tools && cd ~/e2e-tools && npm init -y && npm i playwright-core`
- **服务器上还没跑过**：本机 `ssh gx` 免密仍未通（`Permission denied (publickey)`），
  本文件里的「`/usr/bin/microsoft-edge` 是真二进制」是上游会话的实测结论，
  本次只在本机 Windows Edge 158 上验证

