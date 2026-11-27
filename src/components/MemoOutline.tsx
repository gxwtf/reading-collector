"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OutlineItem } from "@/lib/outline";

/**
 * 正文大纲。标题来自 Markdown 源码（服务端抽好传进来），这里只负责渲染与滚动跟随。
 *
 * 滚动跟随用**文档坐标**比较，不用 viewport 坐标：正文在嵌套容器里滚动时
 * `getBoundingClientRect` 会跟着变，而 `offsetTop` 不会。监听器挂在 window 的
 * 捕获阶段，这样任何嵌套容器的滚动都能收到。
 *
 * 拿不到标题对应的 DOM 时（比如渲染失败）静默跳过该节，不报错。
 */
const READING_LINE_OFFSET = 100;

export function MemoOutline({ headings }: { headings: OutlineItem[] }) {
  const [active, setActive] = useState<string | null>(null);
  const frameRef = useRef(0);

  const minLevel = useMemo(
    () => (headings.length > 0 ? Math.min(...headings.map((h) => h.level)) : 1),
    [headings],
  );

  // 给正文里的标题挂 id，锚点才能跳。MDX 渲染出来的 h1–h4 默认没有 id。
  //
  // 不能按「第 N 个标题 = headings[N]」对位次：MDX 渲染和 Markdown 源码解析
  // 的结果可能不一致（空标题被跳过、行内 HTML 里的标题、渲染器扩展等），
  // 一旦错位，点目录会跳到错误的位置，比不跳更糟。
  // 改成按标题文本匹配，匹配不上就不挂 id（宁可不跳，不能跳错）。
  useEffect(() => {
    const root = document.querySelector(".prose-reading");
    if (!root) return;

    const used = new Set<string>();
    const nodes = Array.from(root.querySelectorAll("h1, h2, h3, h4")) as HTMLElement[];
    for (const item of headings) {
      if (used.has(item.slug)) continue;
      const target = nodes.find((node) => !node.id && node.textContent?.trim() === item.text);
      if (target) {
        target.id = item.slug;
        used.add(item.slug);
      }
    }
  }, [headings]);

  useEffect(() => {
    if (headings.length === 0) return;

    const update = () => {
      frameRef.current = 0;
      const root = document.querySelector(".prose-reading");
      if (!root) return;

      // 用文档坐标判断「哪个标题已经滚过阅读线」
      const rootTop = root.getBoundingClientRect().top + window.scrollY;
      let current: string | null = null;
      for (const heading of headings) {
        const el = document.getElementById(heading.slug);
        if (!el) continue;
        const top = el.getBoundingClientRect().top + window.scrollY;
        // 相对正文顶部的偏移，避免受页面顶部导航高度影响
        if (top - rootTop > READING_LINE_OFFSET) break;
        current = heading.slug;
      }
      setActive(current ?? headings[0]?.slug ?? null);
    };

    const schedule = () => {
      if (!frameRef.current) frameRef.current = requestAnimationFrame(update);
    };

    update();
    // 捕获阶段：嵌套容器的滚动也能收到
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [headings]);

  const jump = (event: React.MouseEvent<HTMLAnchorElement>, slug: string) => {
    event.preventDefault();
    const el = document.getElementById(slug);
    if (!el) return;
    setActive(slug);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // 用 replaceState 而不是改 hash：改 hash 会触发浏览器自己的滚动，和上面的 smooth 打架
    window.history.replaceState(null, "", `#${slug}`);
  };

  return (
    <nav className="flex flex-col gap-0.5">
      {headings.map((heading, index) => {
        const isActive = heading.slug === active;
        return (
          <a
            key={`${heading.slug}-${index}`}
            href={`#${heading.slug}`}
            onClick={(e) => jump(e, heading.slug)}
            aria-current={isActive ? "location" : undefined}
            className={
              isActive
                ? "relative truncate rounded px-2 py-1 text-xs text-brand-strong"
                : "relative truncate rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            }
            style={{ paddingInlineStart: 8 + (heading.level - minLevel) * 12 }}
            title={heading.text}
          >
            <span
              className={
                isActive
                  ? "absolute start-0.5 top-1/2 h-[13px] w-[2px] -translate-y-1/2 rounded-full bg-brand"
                  : "absolute start-0.5 top-1/2 h-[13px] w-[2px] -translate-y-1/2 rounded-full bg-border"
              }
            />
            {heading.text}
          </a>
        );
      })}
    </nav>
  );
}
