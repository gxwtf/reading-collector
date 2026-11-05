"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
import { seekUrl, type Embed } from "@/lib/embed";

type Word = { start: number; end: number; text: string };
type Range = { start: number; from: number; to: number };

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  return ans;
}

/**
 * 视频阅读器：
 * - 播放器 sticky 浮动，滚动时不离开视口
 * - 点时间戳跳转，并把逐字稿滚到对应段
 * - 「跟随播放」按跳转后的计时推进，逐字高亮当前词
 * 词级时间戳体积大，首屏只渲染纯文本段落，挂载后再按需拉 /api/transcript/<id>
 */
export function VideoReader({
  embed,
  title,
  entryId,
  backend,
  locale,
  segmentCount,
  chunks,
}: {
  embed: Embed;
  title: string;
  entryId: number;
  backend: string;
  locale: string;
  segmentCount: number;
  chunks: { start: number; text: string }[];
}) {
  const [seek, setSeek] = useState(0);
  const [playKey, setPlayKey] = useState(0);
  const [following, setFollowing] = useState(false);
  const [words, setWords] = useState<Word[] | null>(null);
  const [ranges, setRanges] = useState<Range[] | null>(null);
  const [activeWord, setActiveWord] = useState(-1);
  const [activeChunk, setActiveChunk] = useState(-1);

  const startedAt = useRef<number>(0);
  const startTime = useRef<number>(0);
  const chunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeChunkRef = useRef(-1);

  const src = seek > 0 || playKey > 0 ? seekUrl(embed, seek) : embed.base;

  // 词级数据按需加载（不参与首屏 RSC）
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/transcript/${entryId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { chunks: Range[]; words: [number, number, string][] } | null) => {
        if (cancelled || !data) return;
        setWords(data.words.map(([start, end, text]) => ({ start, end, text })));
        setRanges(data.chunks);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const chunkStart = useCallback(
    (seconds: number) => {
      const list = ranges ?? chunks.map((c, i) => ({ start: c.start, from: 0, to: 0, i }));
      const idx = list.findIndex((c, i) => {
        const next = list[i + 1];
        return seconds >= c.start && (!next || seconds < next.start);
      });
      return idx;
    },
    [ranges, chunks],
  );

  const jumpTo = useCallback(
    (seconds: number, scroll = true) => {
      setSeek(seconds);
      setPlayKey((k) => k + 1);
      startedAt.current = Date.now();
      startTime.current = seconds;

      if (words) setActiveWord(findWordIndex(words, seconds));

      const ci = chunkStart(seconds);
      if (ci >= 0) {
        setActiveChunk(ci);
        activeChunkRef.current = ci;
        if (scroll) chunkRefs.current[ci]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [chunkStart, words],
  );

  // 估算播放进度 → 逐字推进 / 段落跟随
  useEffect(() => {
    if (!following) return;
    const timer = setInterval(() => {
      const t = startTime.current + (Date.now() - startedAt.current) / 1000;
      if (words) {
        const wi = findWordIndex(words, t);
        if (wi >= 0) setActiveWord(wi);
      }
      const ci = chunkStart(t);
      if (ci >= 0 && ci !== activeChunkRef.current) {
        activeChunkRef.current = ci;
        setActiveChunk(ci);
        chunkRefs.current[ci]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 300);
    return () => clearInterval(timer);
  }, [following, words, chunkStart]);

  return (
    <div className="space-y-4">
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
              {backend} · {locale} · {segmentCount} 段
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
          {chunks.map((c, ci) => {
            const range = ranges?.[ci];
            const renderWords = following && ci === activeChunk && words && range;
            return (
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
                  {renderWords
                    ? words!.slice(range.from, range.to).map((w, i) => {
                        const index = range.from + i;
                        return (
                          <span
                            key={index}
                            onClick={() => jumpTo(w.start, false)}
                            className={
                              index === activeWord
                                ? "rounded-sm bg-brand-red/25 text-foreground"
                                : "transition-colors hover:bg-muted"
                            }
                            title={mmss(w.start)}
                          >
                            {w.text}
                          </span>
                        );
                      })
                    : c.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
