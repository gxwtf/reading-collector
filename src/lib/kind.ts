/**
 * 条目类型的唯一真相：中文名 + 合法取值。
 *
 * 抽出来的原因和 `jobKindFor()` 一样——这套映射曾经在
 * EntryCard / 详情页 / 分享小图 / 首页标题里各写一份，
 * 加一个类型就得改四处，漏一处就会出现「侧栏有『文档』但卡片显示 article」。
 */
export const KINDS = ["article", "video", "podcast", "document"] as const;

export type Kind = (typeof KINDS)[number];

/** 分享图的版式类型：quote 不是条目类型，但也要有中文名（见 LABELS 注释） */
export type ShareKind = Kind | "quote";

const LABELS: Record<string, string> = {
  article: "文章",
  video: "视频",
  podcast: "播客",
  document: "文档",
  // 不是 Entry.kind 的取值，是分享图的「版式」：划线/批注的金句卡片走
  // `/api/share-card?kind=quote`。之前这里漏了它，重建后金句卡会退化成「文章」。
  quote: "摘录",
};

/** 未知类型不抛错，退回「文章」——数据里存在历史脏值，不该让页面崩 */
export function kindLabel(kind: string | null | undefined): string {
  return LABELS[kind ?? ""] ?? "文章";
}

export function isKind(value: string | null | undefined): value is Kind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}
