"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
import { seekUrl, type Embed } from "@/lib/embed";

type Segment = {
  start?: number;
  end?: number;
  text?: string;
  words?: { start?: number; end?: number; text?: string }[];
};

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

type Word = { start: number; end: number; text: string };
type Chunk = { start: number; from: number; to: number; text: string };

/** 把分段拍平成「词 + 段落区间」：词带绝对时间，段落用于滚动定位 */
function buildTranscript(segments: Segment[]) {
  const words: Word[] = [];
  const chunks: Chunk[] = [];

  for (const seg of segments) {
    const segStart = Number(seg.start ?? 0);
    const segWords = (seg.words ?? [])
      .map((w) => ({
        start: Number(w.start ?? segStart),
        end: Number(w.end ?? segStart),
        text: w.text ?? "",
      }))
      .filter((w) => w.text.trim().length > 0);

    if (segWords.length === 0 && !(seg.text ?? "").trim()) continue;

    const last = chunks[chunks.length - 1];
    if (!last || segStart - last.start >= 60) {
      chunks.push({ start: segStart, from: words.length, to: words.length, text: "" });
    }
    const chunk = chunks[chunks.length - 1];

    if (segWords.length > 0) {
      for (const w of segWords) {
        words.push(w);
        chunk.text += w.text;
      }
    } else {
      // 老数据没有词级时间：整段当一个「词」，只能段级高亮
      const text = (seg.text ?? "").trim();
      words.push({ start: segStart, end: Number(seg.end ?? segStart), text });
      chunk.text += ` ${text}`;
    }
    chunk.to = words.length;
  }

  return { words, chunks };
}

function findWordIndex(words: Word[], t: number) {
  let lo = 0;
  let hi = words.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // 时间落在词的间隔里时，仍高亮上一个词，避免闪烁
  return ans;
}

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
  const { words, chunks } = useMemo(() => buildTranscript(segments), [segments]);

  const [seek, setSeek] = useState(0);
  const [playKey, setPlayKey] = useState(0);
  const [following, setFollowing] = useState(false);
  const [activeWord, setActiveWord] = useState(-1);
  const [activeChunk, setActiveChunk] = useState(-1);

  const startedAt = useRef<number>(0);
  const startTime = useRef<number>(0);
  const chunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeChunkRef = useRef(-1);

  const src = seek > 0 || playKey > 0 ? seekUrl(embed, seek) : embed.base;

  const jumpTo = useCallback(
    (seconds: number, scroll = true) => {
      setSeek(seconds);
      setPlayKey((k) => k + 1);
      startedAt.current = Date.now();
      startTime.current = seconds;

      const wi = findWordIndex(words, seconds);
      setActiveWord(wi);

      const ci = chunks.findIndex((c, i) => {
        const next = chunks[i + 1];
        return seconds >= c.start && (!next || seconds < next.start);
      });
      if (ci >= 0) {
        setActiveChunk(ci);
        activeChunkRef.current = ci;
        if (scroll) chunkRefs.current[ci]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [chunks, words],
  );

  // 估算播放进度 → 逐字推进
  useEffect(() => {
    if (!following) return;
    const timer = setInterval(() => {
      const t = startTime.current + (Date.now() - startedAt.current) / 1000;
      const wi = findWordIndex(words, t);
      if (wi >= 0) setActiveWord(wi);

      const ci = chunks.findIndex((c, i) => {
        const next = chunks[i + 1];
        return t >= c.start && (!next || t < next.start);
      });
      if (ci >= 0 && ci !== activeChunkRef.current) {
        activeChunkRef.current = ci;
        setActiveChunk(ci);
        chunkRefs.current[ci]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 300);
    return () => clearInterval(timer);
  }, [following, words, chunks]);

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
                    const t = startTime.current + (Date.now() - startedAt.current) / 1000;
                    startTime.current = t;
                    startedAt.current = Date.now();
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

        <div className="space-y-3 text-[15px] leading-8">
          {chunks.map((c, ci) => (
            <div
              key={c.start}
              ref={(el) => {
                chunkRefs.current[ci] = el;
              }}
              className={`flex gap-3 rounded-md px-1 py-0.5 transition-colors ${
                activeChunk === ci && following ? "bg-brand-red/5" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => jumpTo(c.start)}
                title="跳到这一段"
                className={`w-11 shrink-0 pt-1 text-left text-xs tabular-nums underline-offset-2 hover:underline ${
                  activeChunk === ci ? "font-medium text-brand-red" : "text-muted-foreground"
                }`}
              >
                {mmss(c.start)}
              </button>

              <p className="min-w-0 flex-1">
                {words.slice(c.from, c.to).map((w, i) => {
                  const index = c.from + i;
                  return (
                    <span
                      key={index}
                      onClick={() => jumpTo(w.start, false)}
                      className={
                        index === activeWord && following
                          ? "rounded-sm bg-brand-red/25 text-foreground"
                          : "transition-colors hover:bg-muted"
                      }
                      title={mmss(w.start)}
                    >
                      {w.text}
                    </span>
                  );
                })}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
