"use client";

import Link from "next/link";
import { Bookmark, BookmarkCheck, Clock3 } from "lucide-react";
import { toggleFavorite, setReadState } from "@/actions/entries";
import { kindLabel } from "@/lib/kind";
import { relativeTime } from "@/lib/relative-time";

export type EntryCardData = {
  id: number;
  title: string;
  url: string;
  site: string | null;
  excerpt: string | null;
  kind: string;
  state: string;
  jobStatus?: string | null;
  readState: string;
  favorite: boolean;
  wordCount: number | null;
  durationSec: number | null;
  createdAt: string;
  tags: string[];
};

const stateLabel: Record<string, string> = {
  pending: "排队中",
  running: "抓取中",
  ready: "可读",
  failed: "抓取失败",
};

function formatDuration(sec: number) {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`;
}

/**
 * 元信息行：`类型 · 来源 · 相对时间`（设计说明 §4.3）。
 * 抓取状态不塞进这一行——它是异常态，用底下单独一行红/琥珀字，正常时不出现。
 */
function metaLine(entry: EntryCardData): string {
  return [kindLabel(entry.kind), entry.site, relativeTime(entry.createdAt)]
    .filter(Boolean)
    .join(" · ");
}

type Props = {
  entry: EntryCardData;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (id: number, checked: boolean) => void;
  /** 当前列表的搜索词；带上它，详情页才知道要高亮哪些词 */
  searchQuery?: string;
};

export function EntryCard({ entry, selectable, selected, onToggle, searchQuery }: Props) {
  const href = searchQuery
    ? `/entry/${entry.id}?q=${encodeURIComponent(searchQuery)}`
    : `/entry/${entry.id}`;

  return (
    <article
      className={[
        // 卡片本体不响应点击，点击交给里面铺满整张的 <a>
        "group relative flex h-full flex-col rounded-2xl border bg-card p-5 transition-colors",
        selected ? "border-brand ring-1 ring-brand/30" : "border-hairline hover:border-hairline-dashed",
      ].join(" ")}
    >
      {/* 铺满整张卡片的链接垫层。放在独立元素里而不是包住所有内容，
          因为收藏/已读是 <form><button>——交互元素不能嵌套在 <a> 里。 */}
      <Link
        href={href}
        aria-label={entry.title}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col">
        {selectable ? (
          <input
            type="checkbox"
            aria-label={`选择 ${entry.title}`}
            checked={Boolean(selected)}
            onChange={(e) => onToggle?.(entry.id, e.target.checked)}
            className="pointer-events-auto mb-2 size-4 shrink-0 accent-[var(--brand-strong)]"
          />
        ) : null}

        {/* 元信息与标题右让 5rem，给右上角两个图标按钮腾位置，避免长标题钻到按钮底下 */}
        <p className="pr-20 text-[12px] leading-normal text-ink-3">{metaLine(entry)}</p>

        <h3 className="mt-2 line-clamp-2 pr-16 font-serif text-[18px] font-semibold leading-[1.45] text-ink">
          {entry.title}
        </h3>

        {entry.excerpt ? (
          <p className="mt-2 line-clamp-3 text-[14px] leading-[1.7] text-ink-2">{entry.excerpt}</p>
        ) : null}

        <div className="mt-auto pt-3">
          {entry.state !== "ready" ? (
            <p
              className={[
                "text-[12px]",
                entry.state === "failed" ? "text-destructive" : "text-brand-strong",
              ].join(" ")}
            >
              {entry.state === "pending"
                ? stateLabel[entry.jobStatus ?? "pending"] ?? "排队中"
                : stateLabel[entry.state] ?? entry.state}
            </p>
          ) : null}

          {entry.tags.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {entry.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full bg-paper-muted px-2.5 py-[3px] text-[12px] text-ink-2"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}

          {entry.state === "ready" && (entry.wordCount || entry.durationSec || entry.readState === "done") ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
              {entry.wordCount ? <span>{entry.wordCount} 字</span> : null}
              {entry.durationSec ? <span>{formatDuration(entry.durationSec)}</span> : null}
              {entry.readState === "done" ? <span>已读完</span> : null}
            </p>
          ) : null}
        </div>
      </div>

      {/* 收藏 / 已读：贴着右上角。触屏没有 hover，常显；有鼠标的 hover 才显形。
          用 @media(hover:hover) 而不是 pointer-fine，是因为「能不能 hover」才是这里的关键，
          触屏笔记本带鼠标时也应该按 hover 处理。 */}
      <div className="pointer-events-none absolute right-2.5 top-2.5 z-20 flex items-center gap-0.5">
        <form action={toggleFavorite.bind(null, entry.id)} className="pointer-events-auto">
          <button
            type="submit"
            aria-label={entry.favorite ? `取消收藏 ${entry.title}` : `收藏 ${entry.title}`}
            className={[
              "inline-flex size-9 items-center justify-center rounded-lg transition-opacity hover:bg-paper-muted",
              entry.favorite ? "text-brand-strong" : "text-ink-3 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100",
            ].join(" ")}
          >
            {entry.favorite ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
          </button>
        </form>

        <form action={setReadState.bind(null, entry.id, entry.readState === "done" ? "unread" : "done")} className="pointer-events-auto">
          <button
            type="submit"
            aria-label={entry.readState === "done" ? `标记未读 ${entry.title}` : `标记已读 ${entry.title}`}
            className="inline-flex size-9 items-center justify-center rounded-lg text-ink-3 transition-opacity hover:bg-paper-muted hover:text-ink [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
          >
            <Clock3 className="size-4" />
          </button>
        </form>
      </div>
    </article>
  );
}
