"use client";

import { useEffect, useState } from "react";
import { Columns2, Rows3 } from "lucide-react";

/** 文章详情：两栏 / 只看概括，选择记在 localStorage */
export function ArticleSplit({
  article,
  summary,
}: {
  article: React.ReactNode;
  summary: React.ReactNode;
}) {
  const [onlySummary, setOnlySummary] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOnlySummary(localStorage.getItem("reading:onlySummary") === "1");
    setReady(true);
  }, []);

  function toggle() {
    const next = !onlySummary;
    setOnlySummary(next);
    localStorage.setItem("reading:onlySummary", next ? "1" : "0");
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {onlySummary ? <Rows3 className="size-3.5" /> : <Columns2 className="size-3.5" />}
          {onlySummary ? "显示原文" : "只看概括"}
        </button>
      </div>

      <div
        className={
          ready && onlySummary
            ? "grid gap-6"
            : "grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]"
        }
      >
        {ready && onlySummary ? null : <div className="min-w-0 space-y-6">{article}</div>}
        <aside className="space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-auto lg:pr-1">
          {summary}
        </aside>
      </div>
    </div>
  );
}
