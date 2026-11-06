"use client";

import { useEffect, useState, type CSSProperties } from "react";

type Props = { children: React.ReactNode };

const SIZES = [15, 16, 17, 18, 20];

/** 阅读器外壳：顶部滚动进度条 + 字号/行宽调节（记住选择） */
export function ReadingShell({ children }: Props) {
  const [sizeIndex, setSizeIndex] = useState(1);
  const [wide, setWide] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const savedSize = Number(localStorage.getItem("reading:size"));
    const savedWide = localStorage.getItem("reading:wide");
    if (Number.isInteger(savedSize) && savedSize >= 0 && savedSize < SIZES.length) setSizeIndex(savedSize);
    if (savedWide === "1") setWide(true);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const total = doc.scrollHeight - doc.clientHeight;
      setProgress(total > 0 ? Math.min(100, Math.round((doc.scrollTop / total) * 100)) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  function changeSize(next: number) {
    const clamped = Math.max(0, Math.min(SIZES.length - 1, next));
    setSizeIndex(clamped);
    localStorage.setItem("reading:size", String(clamped));
  }

  function toggleWide() {
    setWide((prev) => {
      localStorage.setItem("reading:wide", prev ? "0" : "1");
      return !prev;
    });
  }

  return (
    <div
      style={
        {
          "--reading-font-size": `${SIZES[sizeIndex]}px`,
          "--reading-width": wide ? "46rem" : "38rem",
        } as CSSProperties
      }
    >
      <div className="fixed inset-x-0 top-14 z-30 h-0.5 bg-transparent">
        <div className="h-full bg-brand transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>

      <div className="sticky top-14 z-10 -mx-1 mb-3 flex items-center gap-1 bg-background/85 px-1 py-1.5 backdrop-blur">
        <button
          type="button"
          onClick={() => changeSize(sizeIndex - 1)}
          aria-label="缩小字号"
          className="h-7 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          A−
        </button>
        <button
          type="button"
          onClick={() => changeSize(sizeIndex + 1)}
          aria-label="放大字号"
          className="h-7 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          A+
        </button>
        <button
          type="button"
          onClick={toggleWide}
          className="h-7 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {wide ? "窄版" : "宽版"}
        </button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{progress}%</span>
      </div>

      {children}
    </div>
  );
}
