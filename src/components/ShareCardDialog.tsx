"use client";

import { useMemo, useState } from "react";
import { Check, Download, Loader2, MessageCircle, X } from "lucide-react";

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
  const [sentence, setSentence] = useState(text);
  const [font, setFont] = useState<string>("song");
  const [theme, setTheme] = useState<string>("light");
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState("");

  const src = useMemo(
    () =>
      `/api/share-card?kind=${kind}` +
      `&title=${encodeURIComponent(title)}` +
      `&text=${encodeURIComponent(sentence)}` +
      `&site=${encodeURIComponent(site)}&url=${encodeURIComponent(url)}` +
      `&font=${font}&theme=${theme}`,
    [kind, title, sentence, site, url, font, theme],
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setHint("链接已复制");
    } catch {
      setHint("复制失败，请手动复制");
    }
    setTimeout(() => setHint(""), 2400);
  }

  async function toWechat() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* 忽略：微信里仍可手动粘贴 */
    }
    const ua = navigator.userAgent;
    if (/MicroMessenger/i.test(ua)) {
      setHint("已复制链接，点右上角「…」→ 发送给朋友");
    } else if (/Android|iPhone|iPad|iPod/i.test(ua)) {
      window.location.href = "weixin://";
      setHint("正在打开微信，粘贴即可发送");
    } else {
      setHint("链接已复制，在微信里粘贴发送");
    }
    setTimeout(() => setHint(""), 4000);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col gap-3 overflow-y-auto overscroll-contain md:grid md:grid-cols-[minmax(0,1fr)_300px] md:items-start md:overflow-hidden">
        {/* 左：预览 */}
        <div className="relative flex min-h-0 items-center justify-center overflow-auto rounded-xl bg-black/20 md:max-h-[94vh]">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-white/60">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="分享图"
            className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain md:max-h-[94vh]"
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
          />
        </div>

        {/* 右：编辑与操作 */}
        <div className="flex flex-col gap-3 md:max-h-[94vh] md:overflow-y-auto md:pr-1">
          <div className="flex items-center justify-between text-white/80 md:hidden">
            <span className="text-sm">{kind === "article" ? "文章分享图" : "金句分享图"}</span>
            <button type="button" onClick={onClose} aria-label="关闭" className="rounded-lg p-1 hover:bg-white/10">
              <X className="size-5" />
            </button>
          </div>

          <label className="space-y-1">
            <span className="text-xs text-white/60">图上文字（可直接改）</span>
            <textarea
              value={sentence}
              onChange={(e) => {
                setSentence(e.target.value.slice(0, 320));
                setLoading(true);
              }}
              rows={5}
              className="w-full resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40"
              placeholder={kind === "article" ? "写一句推荐语…" : "改一句你想发的话…"}
            />
          </label>

          <div className="space-y-2">
            <div className="flex overflow-hidden rounded-lg border border-white/20">
              {FONTS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setFont(f.key);
                    setLoading(true);
                  }}
                  className={`flex-1 px-2 py-1.5 text-xs ${
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
                  className={`flex-1 px-2 py-1.5 text-xs ${
                    theme === t.key ? "bg-white text-black" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <a
            href={src}
            download={`分享图-${Date.now()}.png`}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black"
          >
            <Download className="size-3.5" />
            保存图片
          </a>

          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/25 px-3 py-2 text-xs text-white/85 hover:bg-white/10"
          >
            <Check className="size-3.5" />
            复制链接
          </button>

          <button
            type="button"
            onClick={toWechat}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#07c160] px-3 py-2 text-xs font-medium text-white"
          >
            <MessageCircle className="size-3.5" />
            发到微信
          </button>

          <p className="min-h-[16px] text-center text-[11px] text-white/60">{hint}</p>

          <button
            type="button"
            onClick={onClose}
            className="hidden rounded-lg border border-white/20 px-3 py-2 text-xs text-white/70 hover:bg-white/10 md:block"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
