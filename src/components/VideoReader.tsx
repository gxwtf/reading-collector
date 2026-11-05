"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
import { seekUrl, type Embed } from "@/lib/embed";

type Segment = { start?: number; end?: number; text?: string };

export type TranscriptData = {
  backend: string;
  locale: string;
  text: string;
  segments: unknown;
};

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 逐字稿按 60 秒聚合成段 */
function buildChunks(segments: Segment[]) {
  const chunks: { start: number; text: string }[] = [];
  for (const seg of segments) {
    const start = Number(seg.start ?? 0);
    const text = (seg.text ?? "").trim();
    if (!text) continue;
    const last = chunks[chunks.length - 1];
    if (last && start - last.start < 60) {
      last.text += text.startsWith(" ") || /^[a-zA-Z]/.test(text) ? ` ${text}` : text;
    } else {
      chunks.push({ start, text });
    }
  }
  return chunks;
}

/**
 * 视频阅读器：
 * - 播放器浮动（sticky），滚动正文/概括时始终可见
 * - 点时间戳跳转到对应秒数，并把逐字稿滚到那一段
 * - 「跟随播放」按跳转后的计时估算播放进度，自动滚动逐字稿（第三方播放器无法读取真实进度）
 */
export function VideoReader({
  embed,
  title,
  transcript,
}: {
  embed: Embed;
  title: string;
  transcript: TranscriptData;
}) {
  const segments = useMemo(
    () => (Array.isArray(transcript.segments) ? (transcript.segments as Segment[]) : []),
    [transcript.segments],
  );
  const chunks = useMemo(() => buildChunks(segments), [segments]);

  const [seek, setSeek] = useState(0);
  const [playKey, setPlayKey] = useState(0);
  const [following, setFollowing] = useState(false);
  const [active, setActive] = useState(-1);

  const startedAt = useRef<number>(0);
  const startTime = useRef<number>(0);
  const chunkRefs = useRef<(HTMLDivElement | null)[]>([]);

  const src = seek > 0 || playKey > 0 ? seekUrl(embed, seek) : embed.base;

  const jumpTo = useCallback(
    (seconds: number, scroll = true) => {
      setSeek(seconds);
      setPlayKey((k) => k + 1);
      startedAt.current = Date.now();
      startTime.current = seconds;
      const index = chunks.findIndex((c, i) => {
        const next = chunks[i + 1];
        return seconds >= c.start && (!next || seconds < next.start);
      });
      if (index >= 0) {
        setActive(index);
        if (scroll) {
          chunkRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    },
    [chunks],
  );

  // 估算播放进度：点时间戳后按真实时间推进
  useEffect(() => {
    if (!following) return;
    const timer = setInterval(() => {
      const est = startTime.current + (Date.now() - startedAt.current) / 1000;
      const index = chunks.findIndex((c, i) => {
        const next = chunks[i + 1];
        return est >= c.start && (!next || est < next.start);
      });
      if (index >= 0 && index !== active) {
        setActive(index);
        chunkRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [following, chunks, active]);

  return (
    <div className="space-y-4">
      {/* 浮动播放器：滚动时不离开视口 */}
      <div className="sticky top-14 z-30 -mx-1 bg-background/95 px-1 py-2 backdrop-blur">
        <div
          className="overflow-hidden rounded-lg border border-border bg-black shadow-lg"
          style={{ aspectRatio: embed.ratio }}
        >
          <iframe
            key={playKey}
            src={src}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            className="size-full"
          />
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">逐字稿</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {transcript.backend} · {transcript.locale} · {segments.length} 段
            </span>
            <button
              type="button"
              onClick={() => {
                setFollowing((v) => {
                  if (!v) {
                    startedAt.current = Date.now();
                    startTime.current = seek;
                  }
                  return !v;
                });
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-foreground"
            >
              {following ? <PauseCircle className="size-3.5" /> : <PlayCircle className="size-3.5" />}
              {following ? "停止跟随" : "跟随播放"}
            </button>
          </div>
        </div>

        <div className="space-y-2 text-[15px] leading-8">
          {chunks.map((c, i) => (
            <div
              key={c.start}
              ref={(el) => {
                chunkRefs.current[i] = el;
              }}
              className={`flex gap-3 rounded-md px-1 py-0.5 transition-colors ${
                active === i ? "bg-brand-red/8" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => jumpTo(c.start)}
                title="跳到这一段"
                className={`w-11 shrink-0 pt-1 text-left text-xs tabular-nums underline-offset-2 hover:underline ${
                  active === i ? "font-medium text-brand-red" : "text-muted-foreground"
                }`}
              >
                {mmss(c.start)}
              </button>
              <p className="min-w-0 flex-1">{c.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
