"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, X } from "lucide-react";
import { createEntries } from "@/actions/entries";
import { subscribeFeed } from "@/actions/feeds";
import { mmss } from "@/lib/time";

type Item = { bvid: string; title: string; url: string; duration: number; upper: string };

export function BilibiliFavImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [loading, startLoad] = useTransition();
  const [importing, startImport] = useTransition();
  const [done, setDone] = useState("");
  const [mode, setMode] = useState<"fav" | "collection" | "rss">("fav");

  function load() {
    setError("");
    setDone("");
    startLoad(async () => {
      const endpoint =
        mode === "fav"
          ? `/api/bilibili/fav?mediaId=${encodeURIComponent(input)}`
          : mode === "collection"
            ? `/api/bilibili/collection?url=${encodeURIComponent(input)}`
            : `/api/rss?url=${encodeURIComponent(input)}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "读取失败");
        setItems(null);
        return;
      }
      const list = (data.items as { title: string; url: string; duration?: number; bvid?: string; upper?: string }[]).map(
        (i) => ({
          bvid: i.bvid ?? "",
          title: i.title,
          url: i.url,
          duration: Number(i.duration ?? 0),
          upper: i.upper ?? "",
        }),
      );
      setItems(list);
      setSelected(new Set(list.map((i) => i.url)));
    });
  }

  function importSelected() {
    if (!items) return;
    const urls = items.filter((i) => selected.has(i.url)).map((i) => i.url);
    if (urls.length === 0) return;
    startImport(async () => {
      const fd = new FormData();
      fd.set("urls", urls.join("\n"));
      const res = await createEntries({ ok: false }, fd);
      setDone(res.ok ? `已加入 ${res.added} 条${res.skipped ? `，跳过 ${res.skipped} 条` : ""}` : res.error ?? "导入失败");
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Download className="size-4" />
          批量导入（B 站收藏夹 / 合集 / RSS）
        </button>
        {open ? (
          <button type="button" onClick={() => setOpen(false)} aria-label="关闭" className="text-muted-foreground">
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          <div className="flex gap-1 rounded-md border border-border p-0.5 text-xs">
            {[
              ["fav", "收藏夹"],
              ["collection", "合集 / 分P"],
              ["rss", "RSS"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value as "fav" | "collection" | "rss");
                  setItems(null);
                  setError("");
                }}
                className={`rounded px-2 py-1 ${
                  mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === "fav"
                  ? "收藏夹链接，或 media_id（如 123456）"
                  : mode === "collection"
                    ? "合集里任意一集的链接，如 https://www.bilibili.com/video/BV1xx"
                    : "RSS / Atom 链接，如 https://sspai.com/feed"
              }
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <button
              type="button"
              onClick={load}
              disabled={loading || !input.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              读取
            </button>
          </div>

          {mode === "rss" && items ? (
            <button
              type="button"
              onClick={async () => {
                const res = await subscribeFeed(input.trim());
                setDone(res.ok ? "已订阅，之后每 30 分钟自动检查新条目" : res.error ?? "订阅失败");
              }}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              订阅这个 feed（自动拉新）
            </button>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {done ? <p className="text-sm text-muted-foreground">{done}</p> : null}

          {items ? (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.size === items.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(items.map((i) => i.url)) : new Set())
                    }
                    className="size-4 accent-[var(--primary)]"
                  />
                  全选（{selected.size}/{items.length}）
                </label>
                <button
                  type="button"
                  onClick={importSelected}
                  disabled={importing || selected.size === 0}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-foreground disabled:opacity-50"
                >
                  {importing ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  导入选中
                </button>
              </div>

              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {items.map((item) => (
                  <li key={item.bvid} className="flex items-center gap-2 rounded px-1 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(item.url)}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(item.url);
                          else next.delete(item.url);
                          return next;
                        })
                      }
                      className="size-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {mmss(item.duration)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <p className="text-[11px] text-muted-foreground">
            {mode === "fav"
              ? "私密收藏夹需要在服务器 .env 里配 BILI_SESSDATA；公开收藏夹直接可读。"
              : mode === "collection"
                ? "贴合集里任意一集的链接即可，会自动识别整个合集（或该视频的多 P 分集）。"
                : "RSS 只给节选也能用：导入后 worker 会抓原文，做「全文解锁」。"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
