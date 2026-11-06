"use client";

import type { RefObject } from "react";
import { mmss } from "@/lib/time";

export type TranscriptLine = { start: number; end: number; text: string };

/** 歌词式逐字稿列表：固定高度滚动容器，当前行高亮 */
export function TranscriptPanel({
  lines,
  visible,
  activeLine,
  listRef,
  onSeek,
  onExpand,
}: {
  lines: TranscriptLine[];
  visible: number;
  activeLine: number;
  listRef: RefObject<HTMLDivElement | null>;
  onSeek: (seconds: number) => void;
  onExpand: () => void;
}) {
  return (
    <div
      ref={listRef}
      className="h-[132px] space-y-0.5 overflow-y-auto rounded-md border border-border/60 bg-muted/20 px-2 py-1.5"
    >
      {lines.slice(0, visible).map((line, i) => {
        const active = i === activeLine;
        return (
          <p
            key={line.start}
            data-i={i}
            onClick={() => onSeek(line.start)}
            className={["tr-line flex gap-3 rounded-md px-1 py-1", active ? "tr-line-active" : ""].join(" ")}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSeek(line.start);
              }}
              title="跳到这一行"
              className={`w-11 shrink-0 pt-0.5 text-left text-xs tabular-nums underline-offset-2 hover:underline ${
                active ? "font-medium text-brand" : "text-muted-foreground/60"
              }`}
            >
              {mmss(line.start)}
            </button>
            <span className="min-w-0 flex-1">{line.text}</span>
          </p>
        );
      })}

      {visible < lines.length ? (
        <button
          type="button"
          onClick={onExpand}
          className="w-full rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          展开更多（{visible}/{lines.length} 行）
        </button>
      ) : null}
    </div>
  );
}
