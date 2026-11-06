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
  // iPad / iPhone 的媒体栈对本地流式 mp4 兼容性差，直接回退内嵌播放器
  const [iosFallback, setIosFallback] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) setIosFallback(true);
  }, []);

  const useNative = embed.provider === "bilibili" && precise && !iosFallback;

  const [seek, setSeek] = useState(0);
  const [playKey, setPlayKey] = useState(0);
  // 默认始终跟随；播放器暂停/手动滚动会自动停下
  const [following, setFollowing] = useState(true);
  const [activeLine, setActiveLine] = useState(0);
  const [liveSync, setLiveSync] = useState(false);
  const [pauseReason, setPauseReason] = useState<"manual" | "player" | null>(null);
  // 长讲座几百行，先渲染一批，跟随/点击时再补
  const [visible, setVisible] = useState(120);
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
  const [duration, setDuration] = useState(0);

  const startedAt = useRef<number>(0);
  const startTime = useRef<number>(0);
  const playerTime = useRef<number | null>(null);
  const playerTimeAt = useRef<number>(0);
  const playerState = useRef<number | null>(null);
  const playerStateAt = useRef<number>(0);

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
    setMedia({ video: `/api/media/${entryId}/file`, audio: "" });
    setMediaError(null);
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
    const el = lineRefs.current[index];
    const list = listRef.current;
    if (!el || !list) return;
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
    if (!startedAt.current) {
      startedAt.current = Date.now();
      startTime.current = lines[0]?.start ?? 0;
    }

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
                    hasPlayed.current = true;
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
                    hasPlayed.current = true;
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
          currentTime={now}
          onAdd={(note) => {
            const t = primary()?.currentTime ?? now;
            void addKeyframe(entryId, t, note);
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
          lineRefs={lineRefs}
          onSeek={(seconds) => seekTo(seconds)}
          onExpand={() => setVisible((v) => v + 200)}
        />
        )}
      </section>
    </div>
  );
}
