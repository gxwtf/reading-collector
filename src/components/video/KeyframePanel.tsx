"use client";

import { Plus, Trash2 } from "lucide-react";
import { mmss } from "@/lib/time";

export type KeyframeItem = { id: number; timeSec: number; note: string | null };

export function KeyframePanel({
  items,
  currentTime,
  onAdd,
  onSeek,
  onDelete,
}: {
  items: KeyframeItem[];
  currentTime: number;
  onAdd: () => void;
  onSeek: (seconds: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">关键帧（{items.length}）</h3>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" />
          记下当前时刻 {mmss(currentTime)}
        </button>
      </div>

      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((k) => (
            <li
              key={k.id}
              className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs"
            >
              <button
                type="button"
                onClick={() => onSeek(k.timeSec)}
                className="tabular-nums hover:text-brand-red"
              >
                {mmss(k.timeSec)}
              </button>
              {k.note ? <span className="text-muted-foreground">{k.note}</span> : null}
              <button
                type="button"
                aria-label="删除关键帧"
                onClick={() => onDelete(k.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          播放时点「记下当前时刻」，重要位置会存成可跳转的标签。
        </p>
      )}
    </div>
  );
}
