"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteHighlight } from "@/actions/highlights";

export type HighlightItem = {
  id: number;
  quote: string;
  note: string | null;
  anchor: { block?: number; start?: number; end?: number } | null;
  createdAt: string;
};

/** 划线列表：点击可定位到正文对应段落 */
export function HighlightList({ items }: { items: HighlightItem[] }) {
  const [pending, startTransition] = useTransition();

  function jumpTo(anchor: HighlightItem["anchor"]) {
    if (!anchor || typeof anchor.block !== "number") return;
    const container = document.querySelector(".prose-reading");
    const target = container?.children[anchor.block] as HTMLElement | undefined;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.animate(
      [
        { backgroundColor: "rgba(163,31,36,0.18)" },
        { backgroundColor: "rgba(163,31,36,0)" },
      ],
      { duration: 1600 },
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        正文里选中一段文字，浮出的「划线」按钮就能存下摘录和批注。
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((h) => (
        <li key={h.id} className="group rounded-lg border border-border bg-card p-3">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => jumpTo(h.anchor)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="border-l-2 border-brand-red/60 pl-2 text-sm leading-6">{h.quote}</p>
              {h.note ? <p className="mt-1 pl-2 text-xs text-muted-foreground">批注：{h.note}</p> : null}
              <p className="mt-1 pl-2 text-[11px] text-muted-foreground">{h.createdAt}</p>
            </button>
            <button
              type="button"
              disabled={pending}
              aria-label="删除这条划线"
              onClick={() => startTransition(() => deleteHighlight(h.id))}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
