"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Highlighter, Loader2, X } from "lucide-react";
import { createHighlight } from "@/actions/highlights";

export type HighlightAnchor = { start?: number; end?: number; block?: number };

export type InlineHighlight = {
  id: number;
  quote: string;
  note: string | null;
  anchor: HighlightAnchor | null;
};

type Pending = {
  quote: string;
  anchor: { start: number; end: number } | null;
  x: number;
  y: number;
  coarse: boolean;
};

/** 把 [start, end) 字符区间包成 <mark data-hl>，可跨多个文本节点 */
function wrapRange(root: HTMLElement, start: number, end: number, id: number) {
  if (end <= start) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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

  // 反向切分，前面的节点偏移不受影响。
  // 必须先按 from 切开，再把 mid 按 to-from 切开，否则会把节点开头也包进去
  for (const t of targets.reverse()) {
    if (!t.node.parentNode) continue;
    const len = t.node.data.length;
    const from = Math.max(0, Math.min(t.from, len));
    const to = Math.max(from, Math.min(t.to, len));

    const mid = t.node.splitText(from);
    mid.splitText(to - from);

    const mark = document.createElement("mark");
    mark.dataset.hl = String(id);
    mark.className = "hl-mark";
    mid.parentNode?.insertBefore(mark, mid);
    mark.appendChild(mid);
  }
}

/** 正文根节点：优先取 .prose-reading，偏移都相对它计算 */
function contentRoot(container: HTMLElement): HTMLElement {
  return (container.querySelector(".prose-reading") as HTMLElement | null) ?? container;
}

function offsetIn(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
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

  /** 把已存的划线画回正文：先校验偏移，对不上就按原文重新定位 */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const root = contentRoot(container);

    root.querySelectorAll("mark[data-hl]").forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      (parent as HTMLElement).normalize?.();
    });

    const text = root.textContent ?? "";

    for (const h of highlights) {
      if (!h.quote) continue;
      let start = h.anchor?.start ?? -1;
      let end = h.anchor?.end ?? -1;

      const exact = start >= 0 && end > start && text.slice(start, end) === h.quote;
      if (!exact) {
        const found = text.indexOf(h.quote);
        if (found < 0) continue;
        start = found;
        end = found + h.quote.length;
      }

      wrapRange(root, start, end, h.id);
    }
  }, [highlights]);

  const readSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const container = containerRef.current;
    if (!container) return;
    const root = contentRoot(container);

    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;

    const start = offsetIn(root, range.startContainer, range.startOffset);
    const end = offsetIn(root, range.endContainer, range.endOffset);
    if (end <= start) return;

    // 以 DOM 文本为准（selection.toString() 可能带入额外换行）
    const raw = (root.textContent ?? "").slice(start, end);
    const quote = raw.trim();
    if (quote.length < 1) return;

    const lead = raw.indexOf(quote);
    const anchorStart = start + (lead > 0 ? lead : 0);

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const rect = range.getBoundingClientRect();
    setPending({
      quote: quote.slice(0, 2000),
      anchor: { start: anchorStart, end: anchorStart + quote.length },
      x: Math.min(window.innerWidth - 280, Math.max(12, rect.left + rect.width / 2 - 120)),
      y: Math.max(60, rect.top - 56),
      coarse,
    });
    setSaved(false);
  }, []);

  // 桌面 mouseup；iPad/触屏走 selectionchange + touchend
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
      const res = await createHighlight(entryId, pending.quote, note, {
        block: 0,
        start: pending.anchor?.start ?? 0,
        end: pending.anchor?.end ?? 0,
      });
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

      {saved ? <p className="mt-3 text-xs text-muted-foreground">已划线，可在右栏「划线批注」里查看。</p> : null}
    </div>
  );
}
