import Link from "next/link";
import { Trash2 } from "lucide-react";
import { deleteCollection } from "@/actions/collections";
import { NewCollectionForm } from "@/components/NewCollectionForm";

export type SidebarCounts = {
  total: number;
  unread: number;
  favorite: number;
  article: number;
  video: number;
  podcast: number;
};

type Props = {
  collections: { id: number; name: string; count: number }[];
  counts: SidebarCounts;
  active: { collection?: number; kind?: string; readState?: string; favorite?: boolean };
};

function itemClass(on: boolean) {
  return [
    "flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors",
    on
      ? "bg-foreground font-medium text-background"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  ].join(" ");
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 px-1 pb-2 text-xs font-semibold text-foreground">
      <span className="h-3.5 w-1 rounded-full bg-brand" />
      {children}
    </h2>
  );
}

export function Sidebar({ collections, counts, active }: Props) {
  const isAll = !active.kind && !active.collection && !active.readState && !active.favorite;

  return (
    <aside className="space-y-5 rounded-2xl border border-border bg-card p-3">
      <nav className="space-y-0.5">
        <Link href="/" className={itemClass(isAll)}>
          <span>全部</span>
          <span className="text-xs tabular-nums">{counts.total}</span>
        </Link>
        <Link href="/?readState=unread" className={itemClass(active.readState === "unread")}>
          <span>未读</span>
          <span className="text-xs tabular-nums">{counts.unread}</span>
        </Link>
        <Link href="/?favorite=1" className={itemClass(Boolean(active.favorite))}>
          <span>收藏</span>
          <span className="text-xs tabular-nums">{counts.favorite}</span>
        </Link>
      </nav>

      <section>
        <SectionTitle>类型（自动）</SectionTitle>
        <nav className="space-y-0.5">
          <Link href="/?kind=article" className={itemClass(active.kind === "article")}>
            <span>文章</span>
            <span className="text-xs tabular-nums">{counts.article}</span>
          </Link>
          <Link href="/?kind=video" className={itemClass(active.kind === "video")}>
            <span>视频</span>
            <span className="text-xs tabular-nums">{counts.video}</span>
          </Link>
          <Link href="/?kind=podcast" className={itemClass(active.kind === "podcast")}>
            <span>播客</span>
            <span className="text-xs tabular-nums">{counts.podcast}</span>
          </Link>
        </nav>
      </section>

      <section>
        <SectionTitle>我的分组</SectionTitle>
        <nav className="space-y-0.5">
          {collections.length === 0 ? (
            <p className="px-2.5 py-1 text-xs text-muted-foreground">还没有分组</p>
          ) : (
            collections.map((c) => (
              <div key={c.id} className="group flex items-center gap-1">
                <Link
                  href={`/?collection=${c.id}`}
                  className={`${itemClass(active.collection === c.id)} min-w-0 flex-1`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="ml-2 shrink-0 text-xs tabular-nums">{c.count}</span>
                </Link>
                <form action={deleteCollection.bind(null, c.id)}>
                  <button
                    type="submit"
                    aria-label={`删除分组 ${c.name}`}
                    className="inline-flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </form>
              </div>
            ))
          )}
        </nav>
        <NewCollectionForm />
      </section>
    </aside>
  );
}
