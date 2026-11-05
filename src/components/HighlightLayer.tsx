"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Highlighter, Loader2, X } from "lucide-react";
import { createHighlight } from "@/actions/highlights";

type Pending = {
  quote: string;
  anchor: { block: number; start: number; end: number } | null;
  x: number;
  y: number;
};

/**
 * 包住正文：选中文字后浮出「划线」按钮。
 * 记录选区落在正文第几个顶层块，以及块内起止偏移，便于以后回显。
 */
export function HighlightLayer({
  entryId,
  children,
}: {
  entryId: number;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setPending(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;

    const quote = selection.toString().trim();
    if (quote.length < 2) {
      setPending(null);
      return;
    }

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

    const rect = range.getBoundingClientRect();
    setPending({
      quote: quote.slice(0, 2000),
      anchor: block >= 0 ? { block, start, end: start + quote.length } : null,
      x: Math.min(window.innerWidth - 260, Math.max(12, rect.left + rect.width / 2 - 110)),
      y: Math.max(60, rect.top - 52),
    });
    setSaved(false);
  }, []);

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
    <div ref={containerRef} onMouseUp={handleMouseUp} className="relative">
      {children}

      {pending ? (
        <div
          className="fixed z-40 w-64 rounded-lg border border-border bg-card p-2 shadow-lg"
          style={{ left: pending.x, top: pending.y }}
        >
          {!noteOpen ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground"
              >
                <Highlighter className="size-3.5" />
                划线
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                aria-label="取消"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">“{pending.quote}”</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="写点批注（可选）"
                className="w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
                >
                  {saving ? <Loader2 className="size-3 animate-spin" /> : null}
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNoteOpen(false);
                    setPending(null);
                  }}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
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
