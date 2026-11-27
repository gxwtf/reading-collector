/**
 * 搜索命中区间计算（纯函数，不碰 DOM）。
 *
 * 职责只有一件：给定一段纯文本和用户输入的搜索词，算出「哪些字符区间要涂色」。
 * 页面侧拿到 [{start, end}] 后用 CSS Custom Highlight API 画：
 *   const range = new Range();
 *   range.setStart(textNode, start);
 *   range.setEnd(textNode, end);   // end 不含
 *   CSS.highlights.set("search-hit", new Highlight(...ranges));
 * 好处是正文 DOM 一个节点都不用改，Markdown 渲染结果不受影响。
 *
 * 为什么不用正则匹配：
 *   搜索词是用户随手敲的，里面可能带 . * ( ) [ ] \ + ? 等正则元字符。
 *   直接 new RegExp(term) 轻则语义错（"." 会匹配任意字符，搜 "." 整段全中），
 *   重则遇到未闭合的 "(" 直接抛 SyntaxError。服务端用的是 Prisma 的
 *   content.contains（大小写折叠的子串匹配），这里用 indexOf 循环，
 *   语义与服务端一致，也不会被特殊字符带歪。
 */

/** 一次最多处理这么多个搜索词，防止有人贴一整段话进来把页面拖慢。 */
const MAX_TERMS = 8;
/** 单个词超过这个长度的码点数就丢弃：大概率是误粘贴的整段文字，不是搜索词。 */
const MAX_TERM_LENGTH = 60;

/**
 * 判断是否为空白。按字符显式判断，连不换行空格、全角空格、行/段分隔符一起处理。
 * 不用正则 \s：显式列举行为稳定，也不用猜某个 JS 引擎的 \s 覆盖哪些字符。
 */
function isWhitespace(ch: string): boolean {
  switch (ch) {
    case " ":
    case "\t":
    case "\n":
    case "\r":
    case "\f":
    case "\v":
      return true;
  }
  const code = ch.charCodeAt(0);
  return (
    code === 0x00a0 || // 不换行空格 NBSP
    code === 0x3000 || // 全角空格（中文输入法常见）
    code === 0x2028 || // 行分隔符
    code === 0x2029 // 段分隔符
  );
}

/** 按空白把一个字符串切成词，不使用正则，避免正则元字符带来的意外。 */
function splitWords(input: string): string[] {
  const words: string[] = [];
  let buffer = "";
  for (const ch of input) {
    if (isWhitespace(ch)) {
      if (buffer) {
        words.push(buffer);
        buffer = "";
      }
    } else {
      buffer += ch;
    }
  }
  if (buffer) words.push(buffer);
  return words;
}

/**
 * 把用户输入的搜索串切成词。
 *
 * 规则：按空白切 → 去空 → 转小写 → 去重 → 丢弃超过 60 字的词 → 最多保留 8 个。
 * 转小写是为了和 findSearchMatches 的大小写折叠匹配对齐；提前做一次，
 * 免得每段正文都要重新处理一遍用户输入。
 */
export function prepareSearchTerms(terms: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    if (typeof raw !== "string") continue;
    for (const word of splitWords(raw)) {
      const term = word.toLowerCase();
      if (!term) continue;
      // 按码点数长度：中文、emoji 都能算对，不会被 UTF-16 代理对骗过去。
      if ([...term].length > MAX_TERM_LENGTH) continue;
      if (seen.has(term)) continue;
      seen.add(term);
      out.push(term);
      if (out.length >= MAX_TERMS) return out;
    }
  }
  return out;
}

/**
 * 在一段纯文本里找出所有匹配区间，返回 [{start, end}]（end 不含）。
 *
 * 匹配语义：大小写折叠后的子串匹配，与服务端 content.contains 一致。
 * 不匹配返回空数组；多个词的命中区间重叠时合并，绝不返回相互重叠的区间
 * ——CSS Highlight 不接受重叠的 Range，重叠会让部分浏览器画歪或直接报错。
 */
export function findSearchMatches(
  text: string,
  preparedTerms: readonly string[],
): { start: number; end: number }[] {
  if (!text || preparedTerms.length === 0) return [];

  const folded = text.toLowerCase();
  // toLowerCase 在个别语言里会改变字符串长度（典型：土耳其语 "İ" 折成 "i" + 组合点，
  // 长度 +1）。一旦折叠串和原文长度不同，折叠串上的下标就对不回原文，
  // 涂出来会串位。这时宁可退回原文大小写敏感匹配：少涂几个能接受，涂错位置更糟。
  const foldable = folded.length === text.length;
  const haystack = foldable ? folded : text;

  const raw: { start: number; end: number }[] = [];
  for (const term of preparedTerms) {
    if (!term) continue;
    // 折叠模式下词也要折叠（prepareSearchTerms 已转过，这里再兜一层，
    // 因为该函数也可能被直接调用）；回退模式保持词原样，大小写敏感地找。
    const needle = foldable ? term.toLowerCase() : term;
    if (!needle) continue;
    let from = 0;
    // 每个词独立扫完整段；起点 +1 继续找，允许同一词的命中互相重叠，
    // 交给后面的合并步骤统一处理。
    while (from <= haystack.length - needle.length) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1) break;
      raw.push({ start: idx, end: idx + needle.length });
      from = idx + 1;
    }
  }
  if (raw.length === 0) return [];

  // 先按起点升序（起点相同按终点升序）排序，再线性合并：
  // 下一段的起点落在当前段内部或紧贴当前段末尾（<= last.end）就并进去。
  // 例：abc 命中 [0,3)、cde 命中 [2,5)，合并成 [0,5)，只涂一次。
  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const range of raw) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      if (range.end > last.end) last.end = range.end;
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }
  return merged;
}
