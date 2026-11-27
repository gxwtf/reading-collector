/**
 * 从 Markdown 源码里抽 h1–h4 标题，生成详情页的「目录」（大纲导航）。
 *
 * 为什么从**源码**解析，而不是像 memos 的 MemoOutline 那样从渲染后的 DOM 里找：
 * 1. 详情页是 RSC 渲染，Markdown 原文本来就在服务端手上，不必等客户端 hydration
 *    再去 querySelectorAll("h1,h2,h3,h4")；
 * 2. 目录不该依赖 UI：样式、折叠、懒加载、换渲染组件都会让 DOM 方案变脆，
 *    源码方案只认「作者写了什么标题」；
 * 3. 纯函数可测：node --test 直接跑，不需要 jsdom / 浏览器。
 *
 * 代价是得自己处理代码块、行内代码和行内标记——下面逐条处理。
 */

export type OutlineItem = {
  level: number; // 1..4
  text: string; // 标题纯文本（去掉 Markdown 行内标记）
  slug: string; // 唯一锚点 id，用于 #hash 跳转
};

/** 标题：最多 3 个空格缩进，# 后必须有空白（`#标题` 不算），最多 4 个 # */
const HEADING_RE = /^ {0,3}(#{1,4})\s+(.*)$/;

/** 代码块围栏：``` 或 ~~~，可带语言标记 */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** 行内代码 `x` / ``x``，内容原样保留 */
const INLINE_CODE_RE = /`+([^`\n]*)`+/g;

/** 从 Markdown 源码抽 h1–h4 标题，按出现顺序返回。没有标题返回 []。 */
export function extractOutline(markdown: string): OutlineItem[] {
  if (!markdown) return [];

  const items: OutlineItem[] = [];
  const used = new Map<string, number>(); // 已用 slug → 该 base 的最新序号
  let fence: string | null = null; // 当前代码块的围栏（``` 或 ~~~），null = 不在块内

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = FENCE_RE.exec(line);

    if (fence) {
      // 只有「同种围栏 + 长度不短于开启围栏 + 围栏后无任何内容」才算闭合。
      // 块内的 ```js、~~~ 之类都不闭合，块内的 # 一律不算标题。
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length &&
        line.trim() === fenceMatch[1]
      ) {
        fence = null;
      }
      continue;
    }

    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }

    // 缩进 4 个空格是缩进代码块，正则的 {0,3} 已经把它挡掉了；
    // 行内代码里的 #（如 `` `# 不是标题` ``）也不会命中，因为行首是反引号。
    const m = HEADING_RE.exec(line);
    if (!m) continue;

    const level = m[1].length;
    const text = stripInline(stripClosingHashes(m[2]));
    // 纯标记组成的标题（如 `## ##`）没有可显示的文本，直接跳过
    if (!text) continue;

    items.push({ level, text, slug: uniqueSlug(used, slugify(text)) });
  }

  return items;
}

/** 去掉 ATX 标题结尾的闭合井号（`## 标题 ##` → `标题`） */
function stripClosingHashes(content: string): string {
  const trimmed = content.replace(/\s+$/, "");
  if (/^#+$/.test(trimmed)) return ""; // `## ###` 是空标题
  // CommonMark：闭合序列前必须有空格，所以 `C#` 不会被削掉
  return trimmed.replace(/\s+#+$/, "");
}

/** 去掉行内 Markdown 标记，得到可显示的纯文本 */
function stripInline(source: string): string {
  let out = source;

  // 行内代码先处理，避免里面的 * _ [ ] 被当成标记
  out = out.replace(INLINE_CODE_RE, "$1");
  out = out.replace(/`+/g, "");

  // 图片 ![alt](url) → alt；链接 [text](url) / [text][ref] → text
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  out = out.replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, "$1");
  out = out.replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1");

  // 行内 HTML（<br>、<span> 等）不参与目录
  out = out.replace(/<\/?[a-zA-Z][^>]*>/g, "");

  // 强调：先长后短，避免 `***x***` 只削掉一半
  out = out.replace(/(\*\*\*|___)(.+?)\1/g, "$2");
  out = out.replace(/(\*\*|__)(.+?)\1/g, "$2");
  out = out.replace(/~~(.+?)~~/g, "$1");
  out = out.replace(/\*(.+?)\*/g, "$1");
  // 单下划线只在不挨着字母数字时才算强调，保住 snake_case
  out = out.replace(/(?<![\p{L}\p{N}])_(.+?)_(?![\p{L}\p{N}])/gu, "$1");

  // 反斜杠转义：\* 显示为 *
  out = out.replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");

  return out.replace(/\s+/g, " ").trim();
}

/**
 * 文本 → 锚点 slug：
 * 转小写 → 空格换 `-` → 删掉 Unicode 字母数字和 `-` 以外的字符（中文因此保留）。
 * 全被删光时退回 `section`，保证一定有可用的 id。
 */
function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "");
  return slug || "section";
}

/** 同名标题依次加 `-2`、`-3`；若这些后缀已被别的标题占用则继续往后找 */
function uniqueSlug(used: Map<string, number>, base: string): string {
  if (!used.has(base)) {
    used.set(base, 1);
    return base;
  }

  let n = (used.get(base) ?? 1) + 1;
  let candidate = `${base}-${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }

  used.set(base, n);
  used.set(candidate, 1);
  return candidate;
}
