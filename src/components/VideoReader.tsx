"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { addKeyframe, deleteKeyframe } from "@/actions/keyframes";
import { seekUrl, type Embed } from "@/lib/embed";

export type TranscriptLine = { start: number; end: number; text: string };

const FALLBACK_OFFSET = 96;

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type Media = { video: string; audio: string };

/**
 * 视频阅读器
 * - B 站：自建播放器（后端取直链，video+audio 双流），播放/暂停/进度全由页面掌控 → 暂停即停滚动
 * - YouTube：官方 IFrame API 实时同步
 * - 按行高亮，滚动定位避开悬浮播放器
 */
export function VideoReader({
  embed,
  title,
  entryId,
  backend,
  locale,
  segmentCount,
  lines,
  precise = false,
  keyframes = [],
}: {
  embed: Embed;
  title: string;
  entryId: number;
  backend: string;
  locale: string;
  segmentCount: number;
  lines: TranscriptLine[];
  precise?: boolean;
  keyframes?: { id: number; timeSec: number; note: string | null }[];
}) {
  const useNative = embed.provider === "bilibili" && precise;

  const [seek, setSeek] = useState(0);
  const [playKey, setPlayKey] = useState(0);
  // 默认始终跟随；播放器暂停/手动滚动会自动停下
  const [following, setFollowing] = useState(true);
  const [activeLine, setActiveLine] = useState(-1);
  const [liveSync, setLiveSync] = useState(false);
  const [pauseReason, setPauseReason] = useState<"manual" | "player" | null>(null);
  // 长讲座几百行，先渲染一批，跟随/点击时再补
  const [visible, setVisible] = useState(120);

  const [media, setMedia] = useState<Media | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [duration, setDuration] = useState(0);

  const startedAt = useRef<number>(0);
  const startTime = useRef<number>(0);
  const playerTime = useRef<number | null>(null);
  const playerTimeAt = useRef<number>(0);
  const playerState = useRef<number | null>(null);
  const playerStateAt = useRef<number>(0);
  const programmaticScrollAt = useRef<number>(0);

  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const primary = () => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (audio && audio.currentSrc) return audio;
    return video;
  };
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeRef = useRef(-1);

  const src = useMemo(() => {
    const base = seek > 0 || playKey > 0 ? seekUrl(embed, seek) : embed.base;
    if (embed.provider !== "youtube") return base;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${base}&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
  }, [embed, seek, playKey]);

  // 精确播放：本地 mp4 直接给 <video>
  useEffect(() => {
    if (!useNative) return;
    setMedia({ video: `/api/media/${entryId}/file`, audio: "" });
    setMediaError(null);
  }, [entryId, useNative]);

  // B 站直链（非精确模式暂未启用）
  useEffect(() => {
    if (useNative) return;
    if (embed.provider !== "bilibili") return;
    let cancelled = false;
    setMediaError(null);
    fetch(`/api/media/${entryId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "取直链失败");
        return data as Media;
      })
      .then((data) => {
        if (!cancelled) setMedia({ video: data.video, audio: data.audio });
      })
      .catch((error) => {
        if (!cancelled) setMediaError((error as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [entryId, useNative]);

  // YouTube postMessage
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
      const payload = data as { event?: string; info?: { currentTime?: number; playerState?: number } };
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

  const scrollToLine = useCallback((index: number) => {
    const el = lineRefs.current[index];
    const list = listRef.current;
    if (!el || !list) return;
    programmaticScrollAt.current = Date.now();
    const top = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  const applyLine = useCallback(
    (seconds: number, scroll = true) => {
      const li = lineAt(seconds);
      if (li < 0) return;
      activeRef.current = li;
      setActiveLine(li);
      setVisible((v) => Math.max(v, li + 30));
      if (scroll) setTimeout(() => scrollToLine(li), 60);
    },
    [lineAt, scrollToLine],
  );

  const seekTo = useCallback(
    (seconds: number) => {
      if (useNative) {
        const el = primary();
        if (el) el.currentTime = seconds;
        setNow(seconds);
        setLiveSync(true);
      } else {
        setSeek(seconds);
        setPlayKey((k) => k + 1);
        startedAt.current = Date.now();
        startTime.current = seconds;
        playerTime.current = null;
      }
      applyLine(seconds);
    },
    [applyLine, useNative],
  );

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
    setPauseReason(null);

    if (useNative) {
      const mediaEl = primary();
      if (mediaEl && mediaEl.readyState === 0) mediaEl.load();
      void mediaEl?.play().catch(() => undefined);
    } else {
      applyLine(seconds);
    }
  }, [applyLine, lines, useNative]);

  const paused = useNative ? !playing : false;

  // 跟随 tick
  useEffect(() => {
    if (!following) return;
    const tick = () => {
      const t = useNative
        ? (primary()?.currentTime ?? 0)
        : playerTime.current !== null && Date.now() - playerTimeAt.current < 5000
          ? playerTime.current
          : startTime.current + (Date.now() - startedAt.current) / 1000;

      const li = lineAt(t);
      if (li >= 0 && li !== activeRef.current) {
        activeRef.current = li;
        setActiveLine(li);
        setVisible((v) => Math.max(v, li + 30));
        scrollToLine(li);
      }
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [following, lineAt, scrollToLine, useNative]);

  // 手动滚动 → 暂停跟随
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

  // 播放器暂停 → 暂停跟随（仅 YouTube 需要推断；B 站是自家播放器直接知道）
  useEffect(() => {
    if (!following) return;
    if (useNative) {
      if (!playing) {
        setFollowing(false);
        setPauseReason("player");
      }
      return;
    }
    const timer = setInterval(() => {
      const fresh = Date.now() - playerStateAt.current < 4000;
      if (fresh && playerState.current !== null && playerState.current !== 1) {
        setFollowing(false);
        setPauseReason("player");
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [following, playing, useNative]);

  const togglePlay = useCallback(() => {
    const mediaEl = primary();
    if (!mediaEl) return;
    if (mediaEl instanceof HTMLVideoElement && media?.audio === "") {
      // 本地 mp4 自带音轨，确保不静音
      mediaEl.muted = false;
      mediaEl.volume = 1;
    }
    if (mediaEl.paused) {
      if (mediaEl.readyState === 0) mediaEl.load();
      void mediaEl.play().catch(() => undefined);
    } else {
      mediaEl.pause();
    }
  }, []);

  // 音频为时钟，视频静音跟随
  useEffect(() => {
    if (!useNative) return;
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio || !video) return;

    const syncVideo = () => {
      if (Math.abs(video.currentTime - audio.currentTime) > 0.3) {
        video.currentTime = audio.currentTime;
      }
    };
    const timer = setInterval(() => {
      if (!audio.paused) syncVideo();
    }, 1000);

    return () => clearInterval(timer);
  }, [useNative, media]);

  return (
    <div className="space-y-4">
      <div ref={playerRef} className="sticky top-14 z-30 -mx-1 bg-background/95 px-1 py-2 backdrop-blur">
        <div
          className="relative overflow-hidden rounded-lg border border-border bg-black shadow-lg"
          style={{ aspectRatio: embed.ratio }}
        >
          {useNative ? (
            media ? (
              <>
                <video
                  ref={videoRef}
                  src={media.video}
                  // 精确模式是音视频合一的 mp4，不能静音；双流模式才静音让 audio 出声
                  muted={Boolean(media.audio)}
                  playsInline
                  preload="none"
                  className="size-full"
                  onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                  onPlay={() => {
                    setPlaying(true);
                    setFollowing(true);
                    setPauseReason(null);
                  }}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                />
                <audio
                  ref={audioRef}
                  src={media.audio || undefined}
                  preload="none"
                  onPlay={() => {
                    setPlaying(true);
                    setFollowing(true);
                    setPauseReason(null);
                  }}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                  onEnded={() => setPlaying(false)}
                />

                <button
                  type="button"
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity hover:opacity-100"
                  aria-label={playing ? "暂停" : "播放"}
                >
                  <span className="rounded-full bg-black/60 p-4 text-white">
                    {paused ? <Play className="size-6" /> : <Pause className="size-6" />}
                  </span>
                </button>

                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/60 px-3 py-2 text-white">
                  <button type="button" onClick={togglePlay} aria-label="播放/暂停">
                    {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                  </button>
                  <span className="text-xs tabular-nums">{mmss(now)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.5}
                    value={now}
                    onChange={(e) => seekTo(Number(e.target.value))}
                    className="h-1 flex-1 accent-white"
                  />
                  <span className="text-xs tabular-nums">{duration ? mmss(duration) : "--:--"}</span>
                </div>
              </>
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                {mediaError ? (
                  <>
                    <p>{mediaError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setMedia(null);
                        setMediaError(null);
                        fetch(`/api/media/${entryId}`)
                          .then((r) => r.json())
                          .then((d) => setMedia({ video: d.video, audio: d.audio }))
                          .catch((e) => setMediaError((e as Error).message));
                      }}
                      className="rounded border border-border px-2 py-1"
                    >
                      重试
                    </button>
                  </>
                ) : (
                  <p>正在取视频直链…</p>
                )}
              </div>
            )
          ) : (
            <iframe
              key={playKey}
              src={src}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              className="size-full"
            />
          )}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">逐字稿</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {backend} · {locale} · {segmentCount} 段
              {following ? (useNative || liveSync ? " · 实时同步" : " · 估算同步") : ""}
            </span>

            {following && !useNative && !liveSync ? (
              <button
                type="button"
                onClick={() => {
                  const li = activeRef.current >= 0 ? activeRef.current : 0;
                  startedAt.current = Date.now();
                  startTime.current = lines[li]?.start ?? 0;
                  playerTime.current = null;
                }}
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
              {following ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              {following ? "停止跟随" : "跟随播放"}
            </button>
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">关键帧（{keyframes.length}）</h3>
            <button
              type="button"
              onClick={() => {
                const t = audioRef.current?.currentTime ?? videoRef.current?.currentTime ?? now;
                void addKeyframe(entryId, t, "");
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" />
              记下当前时刻 {mmss(now)}
            </button>
          </div>
          {keyframes.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {keyframes.map((k) => (
                <li key={k.id} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                  <button type="button" onClick={() => seekTo(k.timeSec)} className="tabular-nums hover:text-brand-red">
                    {mmss(k.timeSec)}
                  </button>
                  {k.note ? <span className="text-muted-foreground">{k.note}</span> : null}
                  <button
                    type="button"
                    aria-label="删除关键帧"
                    onClick={() => void deleteKeyframe(k.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">播放时点「记下当前时刻」，重要位置会存成可跳转的标签。</p>
          )}
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

        <div
          ref={listRef}
          className="max-h-[42vh] space-y-1 overflow-y-auto rounded-md border border-border/60 bg-muted/20 px-2 py-2"
        >
          {lines.slice(0, visible).map((line, i) => {
            const active = i === activeLine && following;
            return (
              <p
                key={line.start}
                ref={(el) => {
                  lineRefs.current[i] = el;
                }}
                onClick={() => seekTo(line.start)}
                className={[
                  "flex cursor-pointer gap-3 rounded-md px-1 py-1 transition-all duration-500",
                  active
                    ? "bg-brand-red/15 text-[15px] font-semibold leading-7 text-foreground shadow-sm"
                    : "text-[13.5px] leading-6 text-muted-foreground/45 hover:text-muted-foreground",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => seekTo(line.start)}
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

          {visible < lines.length ? (
            <button
              type="button"
              onClick={() => setVisible((v) => v + 200)}
              className="w-full rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              展开更多（{visible}/{lines.length} 行）
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
