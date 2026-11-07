"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, X } from "lucide-react";

const FONTS = [
  { key: "song", label: "宋体" },
  { key: "kai", label: "楷体" },
  { key: "yuan", label: "圆体" },
  { key: "hei", label: "黑体" },
] as const;

const THEMES = [
  { key: "light", label: "浅色" },
  { key: "dark", label: "深色" },
] as const;

/** 金句卡片预览：可换字体/主题，下载或长按保存 */
export function QuoteCardDialog({
  quote,
  title,
  site,
  onClose,
}: {
  quote: string;
  title: string;
  site: string;
  onClose: () => void;
}) {
  const [font, setFont] = useState<string>("song");
  const [theme, setTheme] = useState<string>("light");
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const src = `/api/quote-card?text=${encodeURIComponent(quote)}&title=${encodeURIComponent(
    title,
  )}&site=${encodeURIComponent(site)}&font=${font}&theme=${theme}`;

  useEffect(() => {
    setMounted(true);
    setLoading(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between text-white/80">
          <span className="text-sm">分享图</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-lg p-1 hover:bg-white/10">
            <X className="size-5" />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black/20">
          {loading ? (
            <div className="flex aspect-[3/4] items-center justify-center text-white/60">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="金句分享图"
            className="max-h-full w-full rounded-xl object-contain"
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-white/20">
            {FONTS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFont(f.key);
                  setLoading(true);
                }}
                className={`px-3 py-1.5 text-xs ${
                  font === f.key ? "bg-white text-black" : "text-white/80 hover:bg-white/10"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex overflow-hidden rounded-lg border border-white/20">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTheme(t.key);
                  setLoading(true);
                }}
                className={`px-3 py-1.5 text-xs ${
                  theme === t.key ? "bg-white text-black" : "text-white/80 hover:bg-white/10"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <a
            href={src}
            download={`金句-${Date.now()}.png`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black"
          >
            <Download className="size-3.5" />
            保存图片
          </a>
        </div>

        <p className="text-center text-[11px] text-white/50">
          iPad/iPhone 也可以长按图片直接保存到相册
        </p>
      </div>
    </div>,
    document.body,
  );
}
