"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { findSearchMatches, prepareSearchTerms } from "@/lib/search-match";

/**
 * 搜索命中的高亮。样式在 globals.css 的 `::highlight(reading-search-match)`。
 *
 * 用 CSS Custom Highlight API 而不是往 DOM 里插 <mark>：
 * - 正文是 MDX 渲染的，插标签会打乱 React 的调和，刷新一次就丢
 * - 划线功能（HighlightLayer）已经在改 DOM 了，再叠一层会互相打架
 * - 高亮纯属展示，不该进 DOM 树
 *
 * 浏览器不支持时（Safari 17 以前）静默降级为不高亮，不报错、不提示——
 * 搜索结果本身已经说明问题，没必要为装饰性功能弹窗。
 */
const HIGHLIGHT_NAME = "reading-search-match";

const supportsHighlightApi = (): boolean =>
  typeof CSS !== "undefined" &&
  typeof CSS.highlights !== "undefined" &&
  typeof Highlight === "function";

/** 这些子树里的文字不算正文，跳过：KaTeX 把公式渲染两遍，SVG（Mermaid）无法被 highlight 绘制 */
const SKIPPED_SUBTREES = ".katex, svg, .katex-display";

function collectRanges(root: HTMLElement, terms: readonly string[]): Range[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      return (node as Element).matches(SKIPPED_SUBTREES)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_SKIP;
    },
  });

  const ranges: Range[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    for (const match of findSearchMatches(text.data, terms)) {
      const range = doc.createRange();
      range.setStart(text, match.start);
      range.setEnd(text, match.end);
      ranges.push(range);
    }
  }
  return ranges;
}

export function SearchHighlight({ query, children }: { query?: string; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !query) return;
    if (!supportsHighlightApi()) return;

    const terms = prepareSearchTerms(query.split(/\s+/));
    if (terms.length === 0) return;

    // 每次取一次而不是缓存：注册表可能被别的组件重置
    let highlight = CSS.highlights.get(HIGHLIGHT_NAME);
    if (!highlight) {
      highlight = new Highlight();
      CSS.highlights.set(HIGHLIGHT_NAME, highlight);
    }

    let ownRanges: Range[] = [];
    let frame: number | null = null;

    const clear = () => {
      for (const range of ownRanges) highlight!.delete(range);
      ownRanges = [];
    };

    const apply = () => {
      frame = null;
      clear();
      ownRanges = collectRanges(root, terms);
      for (const range of ownRanges) highlight!.add(range);
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(apply);
    };

    apply();

    // 正文里代码高亮、公式、链接卡是异步渲染的，DOM 一变就得重算区间。
    // 用 rAF 合并，避免一次刷新触发几十遍。
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, characterData: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      clear();
    };
  }, [query]);

  // contents 让这层包装不产生布局盒子，正文排版不受影响
  return (
    <div ref={rootRef} className="contents">
      {children}
    </div>
  );
}
