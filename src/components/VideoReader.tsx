"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Pause, Play, RefreshCw } from "lucide-react";
import { addKeyframe, deleteKeyframe } from "@/actions/keyframes";
import { seekUrl, type Embed } from "@/lib/embed";
import { mmss } from "@/lib/time";
import { KeyframePanel } from "@/components/video/KeyframePanel";
import { TranscriptPanel } from "@/components/video/TranscriptPanel";

export type TranscriptLine = { start: number; end: number; text: string };

const FALLBACK_OFFSET = 96;


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
  // Safari / iPad 原生支持 HLS，其它浏览器继续用 mp4
  const [hlsSupported, setHlsSupported] = useState(false);
  const [hlsFailed, setHlsFailed] = useState(false);
  useEffect(() => {
    const probe = document.createElement("video");
    setHlsSupported(Boolean(probe.canPlayType("application/vnd.apple.mpegurl")));
  }, []);

  const useNative = embed.provider === "bilibili" && precise;

  const [seek, setSeek] = useState(0);
  const [playKey, setPlayKey] = useState(0);
  // 默认始终跟随；播放器暂停/手动滚动会自动停下
  const [following, setFollowing] = useState(true);
  const [activeLine, setActiveLine] = useState(0);
  const [liveSync, setLiveSync] = useState(false);
  const [pauseReason, setPauseReason] = useState<"manual" | "player" | null>(null);
  // 长讲座几百行，先渲染一批，跟随/点击时再补
  const [visible, setVisible] = useState(120);
  const [clockTick, setClockTick] = useState(0);
  // 「试试去掉字幕」：默认显示，可隐藏（记住选择）
  const [hideTranscript, setHideTranscript] = useState(false);

  useEffect(() => {
    setHideTranscript(localStorage.getItem("reading:hideTranscript") === "1");
  }, []);

  function toggleTranscript() {
    setHideTranscript((prev) => {
      localStorage.setItem("reading:hideTranscript", prev ? "0" : "1");
      return !prev;
    });
  }

  const [media, setMedia] = useState<Media | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);

  const startedAt = useRef<number>(0);
  const startTime = useRef<number>(0);
  const playerTime = useRef<number | null>(null);
  const playerTimeAt = useRef<number>(0);
  const playerState = useRef<number | null>(null);
  const playerStateAt = useRef<number>(0);

  const listRef = useRef<HTMLDivElement>(null);

  const primary = () => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (audio && audio.currentSrc) return audio;
    return video;
  };

  /** 当前播放秒数：本地媒体读真实值；iframe 没有接口，用估算或当前行 */
  const currentSeconds = () => {
    const el = primary();
    if (el && el.currentSrc) return el.currentTime;
    if (following) return startTime.current + (Date.now() - startedAt.current) / 1000;
    return lines[activeRef.current]?.start ?? 0;
  };
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeRef = useRef(-1);
  const hasPlayed = useRef(false);

  const src = useMemo(() => {
    const base = seek > 0 || playKey > 0 ? seekUrl(embed, seek) : embed.base;
    if (embed.provider !== "youtube") return base;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${base}&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
  }, [embed, seek, playKey]);

  // 精确播放：本地 mp4 直接给 <video>
  useEffect(() => {
    if (!useNative) return;
    const src = hlsSupported && !hlsFailed ? `/api/media/${entryId}/hls/index.m3u8` : `/api/media/${entryId}/file`;
    setMedia({ video: src, audio: "" });
    setMediaError(null);
  }, [entryId, useNative, hlsSupported, hlsFailed]);

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
      if (lines.length === 0) return -1;
      // 播放头还没到第一行时，也高亮第一行
      if (seconds < lines[0].start) return 0;
      let idx = 0;
      for (let i = 0; i < lines.length; i += 1) {
        if (seconds >= lines[i].start) idx = i;
        else break;
      }
      return idx;
    },
    [lines],
  );

  const scrollToLine = useCallback((index: number) => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-i="${index}"]`);
    if (!el || !list) return;

    // 用 rect 差值算：offsetTop 依赖定位祖先，这里不能假设
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = elRect.top - listRect.top;
    const target = list.scrollTop + delta - list.clientHeight / 2 + elRect.height / 2;

    try {
      list.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    } catch {
      list.scrollTop = Math.max(0, target);
    }
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
      // 跳转后重置估算锚点，媒体未就绪时也能跟上
      startedAt.current = Date.now();
      startTime.current = seconds;

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
      listRef.current?.querySelectorAll<HTMLElement>("[data-i]").forEach((el) => {
        const i = Number(el.dataset.i ?? -1);
        if (i < 0) return;
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

  // 跟随 tick
  useEffect(() => {
    if (!following) return;
    if (!startedAt.current) {
      startedAt.current = Date.now();
      startTime.current = lines[0]?.start ?? 0;
    }

    const tick = () => {
      const el = primary();
      const nativeReady = useNative && el && el.readyState >= 1;
      const t = nativeReady
        ? el!.currentTime
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

  // 播放器暂停 → 暂停跟随（仅 YouTube 需要推断；B 站是自家播放器直接知道）
  useEffect(() => {
    if (!following || !hasPlayed.current) return;
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
                  controls
                  playsInline
                  preload="none"
                  className="size-full"
                  onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                  onError={() => {
                    if (hlsSupported && !hlsFailed) setHlsFailed(true);
                  }}
                  onPlay={() => {
                    setPlaying(true);
                    setFollowing(true);
                    setPauseReason(null);
                    hasPlayed.current = true;
                  }}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                />
              </>
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                {mediaError ? (
                  <>
                    <p>{mediaError}</p>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="rounded border border-border px-2 py-1"
                    >
                      刷新重试
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
              onClick={toggleTranscript}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-foreground"
            >
              {hideTranscript ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              {hideTranscript ? "显示字幕" : "隐藏字幕"}
            </button>

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

        <KeyframePanel
          items={keyframes}
          currentTime={useNative ? now : (clockTick >= 0 ? currentSeconds() : now)}
          onAdd={(note) => {
            void addKeyframe(entryId, currentSeconds(), note);
          }}
          onSeek={seekTo}
          onDelete={(id) => void deleteKeyframe(id)}
        />

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

        {hideTranscript ? null : (
        <TranscriptPanel
          lines={lines}
          visible={visible}
          activeLine={activeLine}
          listRef={listRef}
          onSeek={(seconds) => seekTo(seconds)}
          onExpand={() => setVisible((v) => v + 200)}
        />
        )}
      </section>
    </div>
  );
}
