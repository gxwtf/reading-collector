"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import { seekUrl, type Embed } from "@/lib/embed";

type Word = { start: number; end: number; text: string };
type Range = { start: number; from: number; to: number };

const PLAYER_OFFSET = 96; // 悬浮播放器遮住的高度，滚动定位时留出来

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
 * 视频阅读器
 * - 播放器 sticky 浮动，滚正文/概括时不离开视口
 * - 点时间戳跳转（B 站 t= / YouTube start=）
 * - 跟随播放：YouTube 走官方 IFrame API 拿真实 currentTime；
 *   B 站没有公开接口，用「跳转时刻 + 真实时间」估算，可一键重同步
 * - 词级时间戳按需从 /api/transcript/<id> 拉取，首屏只渲染纯文本
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
  const [liveSync, setLiveSync] = useState(false);

  const startedAt = useRef<number>(0);
  const startTime = useRef<number>(0);
  const playerTime = useRef<number | null>(null);
  const playerTimeAt = useRef<number>(0);
  const chunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeChunkRef = useRef(-1);

  // YouTube 需要 enablejsapi + origin 才能收发 postMessage
  const src = useMemo(() => {
    const base = seek > 0 || playKey > 0 ? seekUrl(embed, seek) : embed.base;
    if (embed.provider !== "youtube") return base;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${base}&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
  }, [embed, seek, playKey]);

  // 词级数据按需加载
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

  // YouTube IFrame API：让播放器把 currentTime 推过来
  useEffect(() => {
    if (embed.provider !== "youtube") return;

    const onMessage = (event: MessageEvent) => {
      let data: unknown = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const payload = data as { event?: string; info?: { currentTime?: number } };
      if (payload?.event === "infoDelivery" && typeof payload.info?.currentTime === "number") {
        playerTime.current = payload.info.currentTime;
        playerTimeAt.current = Date.now();
        setLiveSync(true);
      }
    };

    window.addEventListener("message", onMessage);

    // 每 2 秒让播放器开始推送进度
    const timer = setInterval(() => {
      document.querySelectorAll("iframe").forEach((frame) => {
        frame.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1 }), "*");
      });
    }, 2000);

    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
  }, [embed.provider, playKey]);

  const chunkAt = useCallback(
    (seconds: number) => {
      const list = ranges ?? chunks.map((c) => ({ start: c.start }));
      let idx = -1;
      for (let i = 0; i < list.length; i += 1) {
        if (seconds >= list[i].start) idx = i;
        else break;
      }
      return idx;
    },
    [ranges, chunks],
  );

  const scrollToChunk = useCallback((index: number) => {
    const el = chunkRefs.current[index];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - PLAYER_OFFSET;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  const jumpTo = useCallback(
    (seconds: number, scroll = true) => {
      setSeek(seconds);
      setPlayKey((k) => k + 1);
      startedAt.current = Date.now();
      startTime.current = seconds;
      playerTime.current = null;

      if (words) setActiveWord(findWordIndex(words, seconds));

      const ci = chunkAt(seconds);
      if (ci >= 0) {
        setActiveChunk(ci);
        activeChunkRef.current = ci;
        if (scroll) setTimeout(() => scrollToChunk(ci), 60);
      }
    },
    [chunkAt, words, scrollToChunk],
  );

  /** 从当前视口所在段落开始跟随，避免一律从 00:00 起 */
  const startFollow = useCallback(() => {
    let ci = activeChunkRef.current;
    if (ci < 0) {
      const playerBottom = PLAYER_OFFSET;
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      chunkRefs.current.forEach((el, i) => {
        if (!el) return;
        const dist = Math.abs(el.getBoundingClientRect().top - playerBottom);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      ci = best;
    }

    const seconds = ranges?.[ci]?.start ?? chunks[ci]?.start ?? 0;
    startedAt.current = Date.now();
    startTime.current = seconds;
    playerTime.current = null;
    activeChunkRef.current = ci;
    setActiveChunk(ci);
    if (words) setActiveWord(findWordIndex(words, seconds));
    setFollowing(true);
  }, [chunks, ranges, words]);

  // 跟随：优先用播放器真实时间，否则用估算
  useEffect(() => {
    if (!following) return;

    const tick = () => {
      const live =
        playerTime.current !== null && Date.now() - playerTimeAt.current < 5000
          ? playerTime.current
          : null;
      const t = live ?? startTime.current + (Date.now() - startedAt.current) / 1000;

      if (words) {
        const wi = findWordIndex(words, t);
        if (wi >= 0) setActiveWord(wi);
      }

      const ci = chunkAt(t);
      if (ci >= 0 && ci !== activeChunkRef.current) {
        activeChunkRef.current = ci;
        setActiveChunk(ci);
        scrollToChunk(ci);
      }
    };

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [following, words, chunkAt, scrollToChunk]);

  /** B 站估算会漂移：以当前高亮段为锚点重同步 */
  const resync = useCallback(() => {
    const ci = activeChunkRef.current >= 0 ? activeChunkRef.current : 0;
    const seconds = ranges?.[ci]?.start ?? chunks[ci]?.start ?? 0;
    startedAt.current = Date.now();
    startTime.current = seconds;
    playerTime.current = null;
  }, [chunks, ranges]);

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">逐字稿</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {backend} · {locale} · {segmentCount} 段
              {following ? (liveSync ? " · 实时同步" : " · 估算同步") : ""}
            </span>

            {following && !liveSync ? (
              <button
                type="button"
                onClick={resync}
                title="播放器里手动拖过进度？点这里重新对齐"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-foreground"
              >
                <RefreshCw className="size-3.5" />
                重同步
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                if (following) {
                  setFollowing(false);
                } else {
                  startFollow();
                }
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
