/**
 * 排版设置的共享定义。
 *
 * 抽出来是因为这几样东西至少有两处要用：
 * - `ReadingShell`（工具条的 A−/A+ 与持久化）
 * - `TypographyPanel`（面板里的各项按钮）
 *
 * 之前 `SIZES` 和行距档位在两个文件各写了一份，改一处忘一处就会
 * 「工具条能调到 20px，面板只能到 18px」这类不一致——本项目最高频的
 * bug 类型（参见 AGENTS.md 里 retryFetch / ingest 各写一遍任务分类的教训）。
 */

export type TypographySettings = {
  font: "sans" | "serif" | "kai" | "round";
  /** 字号像素值 */
  size: number;
  /** 行距倍数 */
  lineHeight: number;
  paragraphGap: "sm" | "md" | "lg";
  wide: boolean;
};

/** 字号档位。保留原值不变，避免老用户的选择失效。 */
export const SIZES = [15, 16, 17, 18, 20] as const;

/** 行距档位 */
export const LINE_HEIGHTS = [1.7, 1.9, 2.1] as const;

/**
 * 字体栈。只列各平台普遍自带的字体，不引 webfont：
 * 中文 webfont 动辄几 MB，首屏会被拖垮。
 *
 * 每一档都按「macOS 名 → Windows 名 → 通用族」排列。踩过的坑：
 * 圆体原来只写了 macOS 的 Yuanti SC 和 PingFang SC，Windows 上都没有，
 * 直接回落到 Microsoft YaHei——和「默认」档一模一样，用户点了以为没反应。
 * Windows 的幼圆是 YouYuan / SIMYOU，必须补上。
 */
export const FONT_STACKS: Record<TypographySettings["font"], string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  serif:
    '"Songti SC", "Noto Serif CJK SC", SimSun, STSong, serif',
  kai: '"Kaiti SC", STKaiti, KaiTi, STKaiti, "Noto Serif CJK SC", serif',
  round:
    '"Yuanti SC", YouYuan, SIMYOU, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
};

/** 段间距（相对字号）。md 取 1.15em，与改动前 .prose-reading p 的 margin 一致 */
export const PARAGRAPH_GAPS: Record<TypographySettings["paragraphGap"], string> = {
  sm: "0.6em",
  md: "1.15em",
  lg: "1.7em",
};

/** 默认值：与改动前完全一致（16px / 1.9 行距 / 标准版心） */
export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  font: "sans",
  size: 16,
  lineHeight: 1.9,
  paragraphGap: "md",
  wide: false,
};

/** 字号档位下标 ↔ 像素值。不在档位里的值归到最近的档。 */
export function sizeIndex(size: number): number {
  const exact = SIZES.indexOf(size as (typeof SIZES)[number]);
  if (exact >= 0) return exact;
  // 兜底：找第一个不小于它的档位，都超过就取最大档
  const next = SIZES.findIndex((s) => s >= size);
  return next === -1 ? SIZES.length - 1 : next;
}

/** 步进字号，返回夹紧后的像素值 */
export function stepSize(size: number, delta: number): number {
  const next = Math.max(0, Math.min(SIZES.length - 1, sizeIndex(size) + delta));
  return SIZES[next];
}
