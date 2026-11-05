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
    "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
    on ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  ].join(" ");
}

export function Sidebar({ collections, counts, active }: Props) {
  const isAll = !active.kind && !active.collection && !active.readState && !active.favorite;

  return (
    <aside className="space-y-5">
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
        <h2 className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          类型（自动）
        </h2>
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
        <h2 className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          我的分组
        </h2>
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
