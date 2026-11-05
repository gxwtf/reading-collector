"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import { seekUrl, type Embed } from "@/lib/embed";

export type TranscriptLine = { start: number; end: number; text: string };

const PLAYER_OFFSET = 96;

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

  const startedAt = useRef<number>(0);
  const startTime = useRef<number>(0);
  const playerTime = useRef<number | null>(null);
  const playerTimeAt = useRef<number>(0);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
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
      const payload = data as { event?: string; info?: { currentTime?: number } };
      if (payload?.event === "infoDelivery" && typeof payload.info?.currentTime === "number") {
        playerTime.current = payload.info.currentTime;
        playerTimeAt.current = Date.now();
        setLiveSync(true);
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

  const scrollToLine = useCallback((index: number) => {
    const el = lineRefs.current[index];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - PLAYER_OFFSET - 8;
    window.scrollTo({ top, behavior: "smooth" });
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
        const dist = Math.abs(el.getBoundingClientRect().top - PLAYER_OFFSET);
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

  const resync = useCallback(() => {
    const li = activeRef.current >= 0 ? activeRef.current : 0;
    startedAt.current = Date.now();
    startTime.current = lines[li]?.start ?? 0;
    playerTime.current = null;
  }, [lines]);

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
                title="在播放器里拖过进度？点这里重新对齐"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-foreground"
              >
                <RefreshCw className="size-3.5" />
                重同步
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => (following ? setFollowing(false) : startFollow())}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-foreground"
            >
              {following ? <PauseCircle className="size-3.5" /> : <PlayCircle className="size-3.5" />}
              {following ? "停止跟随" : "跟随播放"}
            </button>
          </div>
        </div>

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
                    ? "bg-brand-red/8 text-[17px] font-medium leading-9 text-foreground"
                    : "text-[15px] leading-8 text-muted-foreground/55 hover:text-muted-foreground",
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
