"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Highlighter, Loader2, X } from "lucide-react";
import { createHighlight } from "@/actions/highlights";

export type HighlightAnchor = { block?: number; start?: number; end?: number };

export type InlineHighlight = {
  id: number;
  quote: string;
  note: string | null;
  anchor: HighlightAnchor | null;
};

type Pending = {
  quote: string;
  anchor: { block: number; start: number; end: number } | null;
  x: number;
  y: number;
  coarse: boolean;
};

/** 把 [start, end) 字符区间包成 <mark data-hl> */
function wrapRange(block: HTMLElement, start: number, end: number, id: number) {
  if (end <= start) return;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const targets: { node: Text; from: number; to: number }[] = [];
  let pos = 0;
  let node = walker.nextNode() as Text | null;

  while (node) {
    const len = node.data.length;
    const nodeStart = pos;
    const nodeEnd = pos + len;
    const from = Math.max(start, nodeStart) - nodeStart;
    const to = Math.min(end, nodeEnd) - nodeStart;
    if (to > from) targets.push({ node, from, to });
    pos = nodeEnd;
    if (pos >= end) break;
    node = walker.nextNode() as Text | null;
  }

  // 反向处理，避免 splitText 打乱前面节点的偏移
  for (const t of targets.reverse()) {
    if (!t.node.parentNode) continue;
    const tail = t.node.splitText(Math.min(t.to, t.node.data.length));
    const mid = tail.previousSibling as Text | null;
    if (!mid) continue;
    const mark = document.createElement("mark");
    mark.dataset.hl = String(id);
    mark.className = "hl-mark";
    mid.parentNode?.insertBefore(mark, mid);
    mark.appendChild(mid);
  }
}

export function HighlightLayer({
  entryId,
  highlights,
  children,
}: {
  entryId: number;
  highlights: InlineHighlight[];
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  /** 把已存的划线画回正文 */
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // 先清掉旧标记，避免重复包
    root.querySelectorAll("mark[data-hl]").forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      (parent as HTMLElement).normalize?.();
    });

    for (const h of highlights) {
      const anchor = h.anchor;
      if (!anchor || typeof anchor.block !== "number") continue;
      const block = root.children[anchor.block] as HTMLElement | undefined;
      if (!block) continue;
      wrapRange(block, anchor.start ?? 0, anchor.end ?? 0, h.id);
    }
  }, [highlights]);

  const readSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;

    const quote = selection.toString().trim();
    if (quote.length < 2) return;

    let node: Node | null = range.startContainer;
    while (node && node.parentNode !== container) node = node.parentNode;
    const block = node ? Array.prototype.indexOf.call(container.children, node) : -1;

    let start = 0;
    if (node) {
      const pre = document.createRange();
      pre.selectNodeContents(node as Element);
      pre.setEnd(range.startContainer, range.startOffset);
      start = pre.toString().length;
    }

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const rect = range.getBoundingClientRect();
    setPending({
      quote: quote.slice(0, 2000),
      anchor: block >= 0 ? { block, start, end: start + quote.length } : null,
      x: Math.min(window.innerWidth - 280, Math.max(12, rect.left + rect.width / 2 - 120)),
      y: Math.max(60, rect.top - 56),
      coarse,
    });
    setSaved(false);
  }, []);

  // 桌面：mouseup；iPad / 触屏：selectionchange + touchend（Safari 长按选择只触发这些）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onSelectionChange = () => {
      if (noteOpen) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => readSelection(), 260);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("touchend", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("touchend", onSelectionChange);
      if (timer) clearTimeout(timer);
    };
  }, [noteOpen, readSelection]);

  function save() {
    if (!pending) return;
    startTransition(async () => {
      const res = await createHighlight(entryId, pending.quote, note, pending.anchor);
      if (res.ok) {
        setSaved(true);
        setPending(null);
        setNote("");
        setNoteOpen(false);
        window.getSelection()?.removeAllRanges();
      }
    });
  }

  return (
    <div ref={containerRef} onMouseUp={readSelection} className="relative">
      {children}

      {pending ? (
        <div
          className={
            pending.coarse
              ? "fixed inset-x-3 bottom-6 z-40 mx-auto max-w-sm rounded-xl border border-border bg-card p-2 shadow-xl"
              : "fixed z-40 w-64 rounded-lg border border-border bg-card p-2 shadow-lg"
          }
          style={pending.coarse ? undefined : { left: pending.x, top: pending.y }}
        >
          {!noteOpen ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                <Highlighter className="size-4" />
                划线
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                aria-label="取消"
                className="inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="line-clamp-2 px-1 text-[11px] leading-4 text-muted-foreground">“{pending.quote}”</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="写点批注（可选）"
                className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNoteOpen(false);
                    setPending(null);
                  }}
                  className="h-9 rounded-md border border-border px-3 text-sm text-muted-foreground"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {saved ? <p className="mt-3 text-xs text-muted-foreground">已划线，可在下方「划线批注」里查看。</p> : null}
    </div>
  );
}
