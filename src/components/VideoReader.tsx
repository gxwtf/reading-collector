"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import { seekUrl, type Embed } from "@/lib/embed";

export type TranscriptLine = { start: number; end: number; text: string };

const FALLBACK_OFFSET = 96;

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * 视频阅读器（按行高亮，Apple Music 式滚动歌词）
 * - 播放器 sticky 浮动
 * - 点时间戳跳转
 * - 跟随：YouTube 用官方 IFrame API 的真实 currentTime；B 站没有公开接口，用时间估算 + 重同步
 */
export function VideoReader({
  embed,
  title,
  backend,
  locale,
  segmentCount,
  lines,
}: {
  embed: Embed;
  title: string;
  backend: string;
  locale: string;
  segmentCount: number;
  lines: TranscriptLine[];
}) {
  const [seek, setSeek] = useState(0);
  const [playKey, setPlayKey] = useState(0);
  const [following, setFollowing] = useState(false);
  const [activeLine, setActiveLine] = useState(-1);
  const [liveSync, setLiveSync] = useState(false);
  const [pauseReason, setPauseReason] = useState<"manual" | "player" | null>(null);

  const startedAt = useRef<number>(0);
  const startTime = useRef<number>(0);
  const playerTime = useRef<number | null>(null);
  const playerTimeAt = useRef<number>(0);
  const playerState = useRef<number | null>(null);
  const playerStateAt = useRef<number>(0);
  const programmaticScrollAt = useRef<number>(0);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const playerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(-1);

  const src = useMemo(() => {
    const base = seek > 0 || playKey > 0 ? seekUrl(embed, seek) : embed.base;
    if (embed.provider !== "youtube") return base;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${base}&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
  }, [embed, seek, playKey]);

  // YouTube：让播放器把 currentTime 推过来
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
      const payload = data as {
        event?: string;
        info?: { currentTime?: number; playerState?: number };
      };
      if (payload?.event === "infoDelivery" && payload.info) {
        if (typeof payload.info.currentTime === "number") {
          playerTime.current = payload.info.currentTime;
          playerTimeAt.current = Date.now();
          setLiveSync(true);
        }
        if (typeof payload.info.playerState === "number") {
          playerState.current = payload.info.playerState;
          playerStateAt.current = Date.now();
        }
      }
    };

    window.addEventListener("message", onMessage);
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

  const lineAt = useCallback(
    (seconds: number) => {
      let idx = -1;
      for (let i = 0; i < lines.length; i += 1) {
        if (seconds >= lines[i].start) idx = i;
        else break;
      }
      return idx;
    },
    [lines],
  );

  /** 悬浮播放器会占掉一大块，定位时按它真实底边算，否则目标行会被盖住 */
  const scrollToLine = useCallback((index: number) => {
    const el = lineRefs.current[index];
    if (!el) return;
    programmaticScrollAt.current = Date.now();
    const playerBottom = playerRef.current?.getBoundingClientRect().bottom ?? FALLBACK_OFFSET;
    const top = el.getBoundingClientRect().top + window.scrollY - playerBottom - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  const jumpTo = useCallback(
    (seconds: number, scroll = true) => {
      setSeek(seconds);
      setPlayKey((k) => k + 1);
      startedAt.current = Date.now();
      startTime.current = seconds;
      playerTime.current = null;

      const li = lineAt(seconds);
      if (li >= 0) {
        setActiveLine(li);
        activeRef.current = li;
        if (scroll) setTimeout(() => scrollToLine(li), 60);
      }
    },
    [lineAt, scrollToLine],
  );

  /** 从当前视口最近的一行开始跟随，不回到开头 */
  const startFollow = useCallback(() => {
    let li = activeRef.current;
    if (li < 0) {
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      lineRefs.current.forEach((el, i) => {
        if (!el) return;
        const base = playerRef.current?.getBoundingClientRect().bottom ?? FALLBACK_OFFSET;
        const dist = Math.abs(el.getBoundingClientRect().top - base);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      li = best;
    }

    const seconds = lines[li]?.start ?? 0;
    startedAt.current = Date.now();
    startTime.current = seconds;
    playerTime.current = null;
    activeRef.current = li;
    setActiveLine(li);
    setFollowing(true);
  }, [lines]);

  // 跟随：真实时间优先，否则估算
  useEffect(() => {
    if (!following) return;

    const tick = () => {
      const live =
        playerTime.current !== null && Date.now() - playerTimeAt.current < 5000
          ? playerTime.current
          : null;
      const t = live ?? startTime.current + (Date.now() - startedAt.current) / 1000;

      const li = lineAt(t);
      if (li >= 0 && li !== activeRef.current) {
        activeRef.current = li;
        setActiveLine(li);
        scrollToLine(li);
      }
    };

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [following, lineAt, scrollToLine]);

  // 用户手动滚动时暂停跟随，避免和自动滚动打架
  useEffect(() => {
    if (!following) return;
    const onScroll = () => {
      if (Date.now() - programmaticScrollAt.current < 1200) return;
      setFollowing(false);
      setPauseReason("manual");
    };
    window.addEventListener("wheel", onScroll, { passive: true });
    window.addEventListener("touchmove", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", onScroll);
      window.removeEventListener("touchmove", onScroll);
    };
  }, [following]);

  // 播放器暂停/缓冲超过 1.5 秒 → 暂停跟随（仅 YouTube 能读到状态）
  useEffect(() => {
    if (!following || !liveSync) return;
    const timer = setInterval(() => {
      const state = playerState.current;
      const fresh = Date.now() - playerStateAt.current < 4000;
      if (fresh && state !== null && state !== 1) {
        setFollowing(false);
        setPauseReason("player");
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [following, liveSync]);

  const resync = useCallback(() => {
    const li = activeRef.current >= 0 ? activeRef.current : 0;
    startedAt.current = Date.now();
    startTime.current = lines[li]?.start ?? 0;
    playerTime.current = null;
  }, [lines]);

  return (
    <div className="space-y-4">
      <div ref={playerRef} className="sticky top-14 z-30 -mx-1 bg-background/95 px-1 py-2 backdrop-blur">
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
                title="在播放器里拖过进度？点这里重新对齐"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-foreground"
              >
                <RefreshCw className="size-3.5" />
                重同步
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setPauseReason(null);
                if (following) setFollowing(false);
                else startFollow();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-foreground"
            >
              {following ? <PauseCircle className="size-3.5" /> : <PlayCircle className="size-3.5" />}
              {following ? "停止跟随" : "跟随播放"}
            </button>
          </div>
        </div>

        {pauseReason && !following ? (
          <div className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            <span>
              {pauseReason === "manual" ? "检测到手动滚动，已暂停跟随" : "播放器已暂停，跟随自动停下"}
            </span>
            <button
              type="button"
              onClick={() => {
                setPauseReason(null);
                startFollow();
              }}
              className="rounded-md border border-border px-2 py-0.5 hover:text-foreground"
            >
              继续跟随
            </button>
          </div>
        ) : null}

        <div className="space-y-1.5">
          {lines.map((line, i) => {
            const active = i === activeLine && following;
            return (
              <p
                key={line.start}
                ref={(el) => {
                  lineRefs.current[i] = el;
                }}
                className={[
                  "flex gap-3 rounded-md px-1 py-1 transition-all duration-500",
                  active
                    ? "bg-brand-red/15 text-[18px] font-semibold leading-10 text-foreground shadow-sm"
                    : "text-[15px] leading-8 text-muted-foreground/45 hover:text-muted-foreground",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => jumpTo(line.start)}
                  title="跳到这一行"
                  className={`w-11 shrink-0 pt-0.5 text-left text-xs tabular-nums underline-offset-2 hover:underline ${
                    active ? "font-medium text-brand-red" : "text-muted-foreground/60"
                  }`}
                >
                  {mmss(line.start)}
                </button>
                <span className="min-w-0 flex-1">{line.text}</span>
              </p>
            );
          })}
        </div>
      </section>
    </div>
  );
}
