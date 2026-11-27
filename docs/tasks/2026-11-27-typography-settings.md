# 2026-11-27 阅读界面显示格式 + 字体选择

## 目标

给阅读界面补上「显示格式」控制：字体选择、行距、段间距，并把现有的字号/宽度整合成一个统一的排版面板。所有选择记住并在下次打开时生效。

## 现状（2026-11-27 实测）

`ReadingShell.tsx` 只有两个控制：
- 字号：`SIZES = [15,16,17,18,20]`，存 `localStorage["reading:size"]`
- 宽度：两档 `38rem` / `46rem`，存 `localStorage["reading:wide"]`

`.prose-reading` 里 `line-height: 1.9` 是**写死的**，段间距（`> *` 的 margin）也是写死的。字体走系统默认。

## 断言

| 断言 | 命令 / 操作 | 期望 |
| --- | --- | --- |
| 字体选择生效 | 调成「宋体」后，`.prose-reading` 的 `getComputedStyle().fontFamily` | 含 `Songti`/`SimSun`/`serif` |
| 字体选择持久化 | 选完刷新页面 | 保持上次选择 |
| 行距可调 | 调到「宽松」 | `getComputedStyle().lineHeight` 增大（约 2.1 倍字号） |
| 段距可调 | 调到「大」 | `.prose-reading > p` 的 `marginBottom` 增大 |
| 字号仍可用 | 点 A+ | `fontSize` 递增，且不影响字体/行距设置 |
| 面板不遮挡正文 | 打开排版面板 | 正文可见区域不被完全覆盖（面板可关闭） |
| 默认值不变 | 新用户（清 localStorage） | 与改动前一致：16px / 38rem / 1.9 行距 |
| 移动端可用 | 390px 宽 | 面板不溢出，按钮 ≥ 36px 可点 |
| 深色模式 | 切深色 | 面板与正文对比度正常，无白块 |
| 字体回退 | 选了系统没有的字体 | 回退到衬线/无衬线，不崩、不变空白 |

## 失败文案

| 场景 | 用户看到 |
| --- | --- |
| localStorage 不可用（隐私模式） | 选择仍生效（本次会话），但不持久化，**不弹错误** |
| 选中的字体系统没有 | 静默回退到下一档，界面正常显示 |

## 边界

**做**
- 字体：4 档（默认无衬线 / 宋体 / 楷体 / 圆体）——只列本机/移动端普遍存在的字体，不引外部字体文件
- 行距：3 档（紧凑 1.7 / 标准 1.9 / 宽松 2.1）
- 段距：3 档（小 / 中 / 大）
- 字号：保留现有 5 档
- 宽度：保留现有两档
- 全部存 localStorage，与服务端无关（不做账号同步）

**不做**
- 不引 webfont（体积 + 首屏阻塞）
- 不做账号级同步（要改 schema，且用户没提）
- 不改分享页的排版（那是给读者的，不是本人的偏好）
- 不改列表页

**基线数字**
- `SIZES = [15,16,17,18,20]`，默认 index 1 = 16px
- `.prose-reading`：`line-height: 1.9`、`max-width: 38rem`、`letter-spacing: 0.01em`
- 现有 localStorage 键：`reading:size`、`reading:wide`（要兼容，不能丢用户已有选择）

## 并行拆分

单个 agent 做：新组件 `TypographyPanel.tsx`（UI 部分）。
主线程做：`ReadingShell.tsx` 改造 + `globals.css` 变量化（与 agent 的文件不重叠）。
