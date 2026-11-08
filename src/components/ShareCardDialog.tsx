"use client";

import { useState } from "react";
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

/** 分享图预览：文章卡 / 金句卡，都带二维码；可换字体与主题后下载 */
export function ShareCardDialog({
  kind,
  title,
  text,
  site,
  url,
  onClose,
}: {
  kind: "article" | "quote";
  title: string;
  text: string;
  site: string;
  url: string;
  onClose: () => void;
}) {
  const [font, setFont] = useState<string>("song");
  const [theme, setTheme] = useState<string>("light");
  const [loading, setLoading] = useState(true);

  const src =
    `/api/share-card?kind=${kind}` +
    `&title=${encodeURIComponent(title)}` +
    `&text=${encodeURIComponent(text)}` +
    `&site=${encodeURIComponent(site)}` +
    `&url=${encodeURIComponent(url)}` +
    `&font=${font}&theme=${theme}`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col gap-3 overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between text-white/80">
          <span className="text-sm">{kind === "article" ? "文章分享图" : "金句分享图"}</span>
          <button type="button" onClick={onClose} aria-label="关闭" className="rounded-lg p-1 hover:bg-white/10">
            <X className="size-5" />
          </button>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-black/20">
          {loading ? (
            <div className="flex aspect-[3/4] items-center justify-center text-white/60">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="分享图"
            className="w-full rounded-xl"
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
            download={`分享图-${Date.now()}.png`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black"
          >
            <Download className="size-3.5" />
            保存图片
          </a>
        </div>

        <p className="text-center text-[11px] text-white/50">
          图上带二维码，扫码即可在手机上打开 · 也可长按图片保存到相册
        </p>
      </div>
    </div>
  );
}
