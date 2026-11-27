"use client";

import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  FONT_STACKS,
  LINE_HEIGHTS,
  PARAGRAPH_GAPS,
  SIZES,
  sizeIndex,
  stepSize,
  type TypographySettings,
} from "@/components/typography";

export type { TypographySettings };

const FONTS: Array<{ key: TypographySettings["font"]; label: string }> = [
  { key: "sans", label: "默认" },
  { key: "serif", label: "宋体" },
  { key: "kai", label: "楷体" },
  { key: "round", label: "圆体" },
];

const LINE_HEIGHT_LABELS: Record<number, string> = { 1.7: "紧凑", 1.9: "标准", 2.1: "宽松" };
const GAP_LABELS: Record<TypographySettings["paragraphGap"], string> = { sm: "小", md: "中", lg: "大" };

const WIDTHS: Array<{ key: boolean; label: string }> = [
  { key: false, label: "标准" },
  { key: true, label: "宽" },
];

const chipBase =
  "flex h-9 items-center justify-center rounded-md border px-3 text-xs transition-colors";
const chipIdle = "border-border bg-transparent text-muted-foreground hover:text-foreground";
const chipActive = "border-brand bg-muted text-brand-strong";

function chipClass(active: boolean): string {
  return cn(chipBase, active ? chipActive : chipIdle);
}

/** 排版面板：字体 / 字号 / 行距 / 段距 / 版心，改动即生效（受控组件） */
export function TypographyPanel({
  value,
  onChange,
  onClose,
}: {
  value: TypographySettings;
  onChange: (next: TypographySettings) => void;
  onClose: () => void;
}): ReactElement {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 字号档位统一走 typography.ts 的 sizeIndex / stepSize，
  // 避免和工具条的 A−/A+ 各写一套边界判断
  const activeSize = sizeIndex(value.size);

  /**
   * 正文实际解析到的字体。
   *
   * 光看设置项不够——字体栈里的名字系统没有时会静默回退，用户会以为
   * 「点了没反应」。这里读一次真实的 computed font-family 显示出来，
   * 一眼能分清「是真变了」还是「回退成默认了」。
   */
  const [effectiveFont, setEffectiveFont] = useState("");
  useEffect(() => {
    const el = document.querySelector(".prose-reading");
    if (!el) return;
    const family = getComputedStyle(el).fontFamily;
    // 只取第一个（最常是实际选中的那个），太长就截断
    const first = family.split(",")[0]?.replace(/["']/g, "").trim() ?? "";
    setEffectiveFont(first || family.slice(0, 24));
  }, [value.font]);

  function patch(next: Partial<TypographySettings>) {
    onChange({ ...value, ...next });
  }

  function changeSize(delta: number) {
    patch({ size: stepSize(value.size, delta) });
  }

  if (!mounted) return <></>;

  return createPortal(
    <>
      {/* 透明遮罩：不压暗正文，只负责点击关闭 */}
      <div className="fixed inset-0 z-40" aria-hidden="true" onClick={onClose} />

      <div
        role="dialog"
        aria-label="排版设置"
        aria-modal="false"
        className={cn(
          "fixed z-50 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 text-foreground shadow-lg",
          // 移动端：底部 sheet，两边留 12px，最多占 70vh，不盖满正文
          "inset-x-3 bottom-3 max-h-[70vh] overflow-y-auto overscroll-contain",
          // 桌面端：工具条右下方的浮层卡片
          "sm:inset-x-auto sm:right-4 sm:top-28 sm:bottom-auto sm:w-80 sm:max-h-none sm:overflow-visible",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">排版</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 字体 */}
        <section className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">字体</span>
            {/* 显示当前实际解析到的字体族。系统没有该字体会回退，
                这行能立刻看出「点了但没变」是回退还是没生效。 */}
            <span className="truncate pl-2 text-[0.65rem] text-muted-foreground/80" style={{ maxWidth: "60%" }} title={effectiveFont}>
              {effectiveFont}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {FONTS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => patch({ font: item.key })}
                aria-pressed={value.font === item.key}
                className={cn(chipClass(value.font === item.key), "h-auto min-h-9 flex-col gap-0.5 py-1.5")}
              >
                <span className="text-sm leading-tight" style={{ fontFamily: FONT_STACKS[item.key] }}>
                  字体
                </span>
                <span className="text-[0.65rem] leading-tight opacity-70">{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 字号 */}
        <section className="flex items-center justify-between gap-1.5">
          <span className="text-xs text-muted-foreground">字号</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => changeSize(-1)}
              disabled={activeSize <= 0}
              aria-label="缩小字号"
              className={cn(chipClass(false), "w-11 disabled:opacity-50")}
            >
              A−
            </button>
            <span className="w-8 text-center text-sm tabular-nums">{SIZES[activeSize]}</span>
            <button
              type="button"
              onClick={() => changeSize(1)}
              disabled={activeSize >= SIZES.length - 1}
              aria-label="放大字号"
              className={cn(chipClass(false), "w-11 disabled:opacity-50")}
            >
              A+
            </button>
          </div>
        </section>

        {/* 行距 */}
        <section className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">行距</span>
          <div className="grid grid-cols-3 gap-1.5">
            {LINE_HEIGHTS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => patch({ lineHeight: key })}
                aria-pressed={value.lineHeight === key}
                className={chipClass(value.lineHeight === key)}
              >
                {LINE_HEIGHT_LABELS[key]}
              </button>
            ))}
          </div>
        </section>

        {/* 段距 */}
        <section className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">段距</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(GAP_LABELS) as TypographySettings["paragraphGap"][]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => patch({ paragraphGap: key })}
                aria-pressed={value.paragraphGap === key}
                className={chipClass(value.paragraphGap === key)}
              >
                {GAP_LABELS[key]}
              </button>
            ))}
          </div>
        </section>

        {/* 版心 */}
        <section className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">版心</span>
          <div className="grid grid-cols-2 gap-1.5">
            {WIDTHS.map((item) => (
              <button
                key={String(item.key)}
                type="button"
                onClick={() => patch({ wide: item.key })}
                aria-pressed={value.wide === item.key}
                className={chipClass(value.wide === item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <p className="border-t border-border pt-2 text-xs text-muted-foreground">
          选择会记住，下次打开自动生效
        </p>
      </div>
    </>,
    document.body,
  );
}
