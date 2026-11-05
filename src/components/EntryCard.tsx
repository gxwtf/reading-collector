import Link from "next/link";
import { Bookmark, BookmarkCheck, Clock3, FileText, Video } from "lucide-react";
import { toggleFavorite, setReadState } from "@/actions/entries";
import { Badge } from "@/components/ui/badge";

export type EntryCardData = {
  id: number;
  title: string;
  url: string;
  site: string | null;
  excerpt: string | null;
  kind: string;
  state: string;
  readState: string;
  favorite: boolean;
  wordCount: number | null;
  durationSec: number | null;
  createdAt: Date;
  tags: string[];
};

const stateLabel: Record<string, string> = {
  pending: "抓取中",
  ready: "可读",
  failed: "抓取失败",
};

function formatDuration(sec: number) {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`;
}

export function EntryCard({ entry }: { entry: EntryCardData }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand-red/40">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">
          {entry.kind === "article" ? (
            <FileText className="size-4" />
          ) : (
            <Video className="size-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <Link
            href={`/entry/${entry.id}`}
            className="block truncate font-medium hover:text-brand-red"
            title={entry.title}
          >
            {entry.title}
          </Link>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {entry.site ? <span>{entry.site}</span> : null}
            {entry.wordCount ? <span>{entry.wordCount} 字</span> : null}
            {entry.durationSec ? <span>{formatDuration(entry.durationSec)}</span> : null}
            {entry.state !== "ready" ? (
              <span className={entry.state === "failed" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}>
                {stateLabel[entry.state] ?? entry.state}
              </span>
            ) : null}
            {entry.readState === "done" ? <span>已读完</span> : null}
          </p>

          {entry.excerpt ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{entry.excerpt}</p>
          ) : null}

          {entry.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="font-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <form action={toggleFavorite.bind(null, entry.id)}>
            <button
              type="submit"
              aria-label={entry.favorite ? "取消收藏" : "收藏"}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-brand-red"
            >
              {entry.favorite ? (
                <BookmarkCheck className="size-4 text-brand-red" />
              ) : (
                <Bookmark className="size-4" />
              )}
            </button>
          </form>

          <form action={setReadState.bind(null, entry.id, entry.readState === "done" ? "unread" : "done")}>
            <button
              type="submit"
              aria-label={entry.readState === "done" ? "标记未读" : "标记已读"}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              <Clock3 className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}
