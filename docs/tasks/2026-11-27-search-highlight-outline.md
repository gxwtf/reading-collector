# 2026-11-27 搜索高亮 + 正文大纲

## 目标

在条目详情页做两件事：(1) 从列表搜索进来时，正文里命中搜索词的地方要高亮；(2) 长文提供 h1–h4 大纲导航。做法借鉴 memos 的 `useSearchMatchHighlight` 与 `MemoOutline`。

## 断言

每条都必须实跑并贴输出，不能写「应该生效」。

### 搜索高亮

| 断言 | 命令 / 操作 | 期望 |
| --- | --- | --- |
| 纯函数：大小写折叠匹配 | `node --test src/lib/search-match.test.ts` | 全绿，含中文、英文、大小写、重叠词 |
| 纯函数：不匹配时不返回区间 | 同上 | `findSearchMatches("abc", ["xyz"])` 返回 `[]` |
| 支持 CSS Highlight API | 浏览器 console `typeof CSS.highlights !== "undefined"` | `true`（Chrome/Edge） |
| 高亮实际绘制 | 访问 `/entry/<id>?q=<正文里有的词>` | 正文里该词有底色；`document.querySelector(".prose-reading").innerHTML` 与不带 q 时**逐字节相同**（说明没改 DOM） |
| KaTeX / SVG 被跳过 | 正文含公式时 | 公式区域不被涂色（`SKIPPED_SUBTREES`） |
| 无 q 参数 | 访问 `/entry/<id>` | 无任何高亮，无 console 报错 |
| 服务端匹配语义一致 | 搜索结果列表里的词 vs 正文高亮的词 | 同一套（大小写折叠子串） |

### 正文大纲

| 断言 | 命令 / 操作 | 期望 |
| --- | --- | --- |
| 纯函数：抽标题 | `node --test src/lib/outline.test.ts` | 全绿，含 h1–h4、跳过代码块内 `#` |
| 纯函数：slug 唯一 | 同上 | 两个同名标题得到不同 slug |
| 大纲渲染 | 正文含 ≥3 个标题时打开详情页 | 右栏出现「目录」，层级缩进正确 |
| 滚动跟随 | 滚到某节 | 该节对应项高亮，且 URL hash 不变（点击才改） |
| 无标题 | 正文无 h1–h4 | 不渲染目录区块（不显示空框） |

## 失败文案（用户看到的原文）

| 场景 | 文案 |
| --- | --- |
| 搜索词在正文里找不到 | 不显示任何提示（正文照常显示，只是没底色） |
| 正文没有标题 | 不渲染目录区块，不留空占位 |
| 浏览器不支持 Highlight API | 静默降级为不高亮，**不报错、不弹提示** |

## 边界

**做**
- 只做详情页（`/entry/[id]`），列表页不动
- 搜索词从 URL `?q=` 读，最多 60 字（与服务端 `page.tsx` 一致）
- 大纲只收 h1–h4

**不做**
- 不做瀑布流布局（评估过：我们的卡片高度差异小，收益不抵成本）
- 不改搜索的后端逻辑（仍是 ILIKE）
- 不做大纲的折叠/展开
- 不加依赖（Highlight API 是浏览器原生的，不做 polyfill）

**基线数字**（2026-11-27 实测）
- Entry 31 条，正文总计 47KB
- 正文渲染入口：`src/app/entry/[id]/page.tsx` 的 `MDXRemote`（第 212 行附近）
- 右栏 `<aside>` 在第 233 行，已有 3 个 `<section>`，大纲插在第一个之前
- 现有 `globals.css` 已有 `.hl-mark`（划线用），搜索高亮另起 `::highlight()` 选择器，不复用

## 并行拆分（依据：改不同文件、不共享状态）

| agent | 产物 | 文件 |
| --- | --- | --- |
| A | 搜索匹配纯函数 | `src/lib/search-match.ts` + `src/lib/search-match.test.ts` |
| B | 大纲抽取纯函数 | `src/lib/outline.ts` + `src/lib/outline.test.ts` |
| 主 | 接线（串行，两个 agent 都完成后） | `page.tsx`、`globals.css`、两个 client 组件 |

两个 agent 不碰 `page.tsx`，所以并行安全。接线必须串行——两个功能都要改同一个页面。
