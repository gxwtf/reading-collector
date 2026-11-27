"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Settings2 } from "lucide-react";
import { TypographyPanel } from "@/components/TypographyPanel";
import {
  DEFAULT_TYPOGRAPHY,
  FONT_STACKS,
  LINE_HEIGHTS,
  PARAGRAPH_GAPS,
  SIZES,
  sizeIndex,
  stepSize,
  type TypographySettings,
} from "@/components/typography";

type Props = { children: React.ReactNode };

const STORAGE_KEY = "reading:typography";

/**
 * 读排版设置。
 *
 * 兼容两种旧键：老版本只存 `reading:size`（档位下标）和 `reading:wide`（"0"/"1"），
 * 新版本存一个 JSON。老用户升级后不该丢掉已有选择，所以没有新键时读一次旧键。
 */
function loadSettings(): TypographySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TypographySettings>;
      return {
        font: parsed.font && parsed.font in FONT_STACKS ? parsed.font : DEFAULT_TYPOGRAPHY.font,
        size:
          typeof parsed.size === "number" && (SIZES as readonly number[]).includes(parsed.size)
            ? parsed.size
            : DEFAULT_TYPOGRAPHY.size,
        lineHeight:
          typeof parsed.lineHeight === "number" &&
          (LINE_HEIGHTS as readonly number[]).includes(parsed.lineHeight)
            ? parsed.lineHeight
            : DEFAULT_TYPOGRAPHY.lineHeight,
        paragraphGap:
          parsed.paragraphGap === "sm" || parsed.paragraphGap === "md" || parsed.paragraphGap === "lg"
            ? parsed.paragraphGap
            : DEFAULT_TYPOGRAPHY.paragraphGap,
        wide: parsed.wide === true,
      };
    }

    // 迁移旧格式
    const legacySize = Number(localStorage.getItem("reading:size"));
    const legacyWide = localStorage.getItem("reading:wide");
    return {
      ...DEFAULT_TYPOGRAPHY,
      size:
        Number.isInteger(legacySize) && legacySize >= 0 && legacySize < SIZES.length
          ? SIZES[legacySize]
          : DEFAULT_TYPOGRAPHY.size,
      wide: legacyWide === "1",
    };
  } catch {
    // localStorage 不可用（隐私模式）：用默认值，本次会话仍可调，只是不持久化
    return DEFAULT_TYPOGRAPHY;
  }
}

function saveSettings(next: TypographySettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 存不了就算了，不打断阅读
  }
}

/** 阅读器外壳：顶部滚动进度条 + 排版面板（字号/字体/行距/段距/版心，记住选择） */
export function ReadingShell({ children }: Props) {
  const [settings, setSettings] = useState<TypographySettings>(DEFAULT_TYPOGRAPHY);
  const [panelOpen, setPanelOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  // 首帧之后再读：localStorage 在 SSR 时不存在，直接读会导致 hydration 不一致
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const total = doc.scrollHeight - doc.clientHeight;
      setProgress(total > 0 ? Math.min(100, Math.round((doc.scrollTop / total) * 100)) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const update = useCallback((next: TypographySettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const atMinSize = sizeIndex(settings.size) === 0;
  const atMaxSize = sizeIndex(settings.size) === SIZES.length - 1;

  return (
    <div
      style={
        {
          "--reading-font-size": `${settings.size}px`,
          "--reading-width": settings.wide ? "46rem" : "38rem",
          "--reading-font-family": FONT_STACKS[settings.font],
          "--reading-line-height": String(settings.lineHeight),
          "--reading-paragraph-gap": PARAGRAPH_GAPS[settings.paragraphGap],
        } as CSSProperties
      }
    >
      <div className="fixed inset-x-0 top-14 z-30 h-0.5 bg-transparent">
        <div className="h-full bg-brand transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>

      <div className="sticky top-14 z-10 -mx-1 mb-3 flex items-center gap-1 bg-background/85 px-1 py-1.5 backdrop-blur">
        <button
          type="button"
          onClick={() => update({ ...settings, size: stepSize(settings.size, -1) })}
          aria-label="缩小字号"
          disabled={atMinSize}
          className="h-8 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          A−
        </button>
        <button
          type="button"
          onClick={() => update({ ...settings, size: stepSize(settings.size, 1) })}
          aria-label="放大字号"
          disabled={atMaxSize}
          className="h-8 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          A+
        </button>
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          aria-label="排版设置"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="size-3.5" />
          排版
        </button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{progress}%</span>
      </div>

      {panelOpen ? (
        <TypographyPanel value={settings} onChange={update} onClose={() => setPanelOpen(false)} />
      ) : null}

      {children}
    </div>
  );
}
