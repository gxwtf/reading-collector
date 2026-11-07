import Link from "next/link";
import { Trash2 } from "lucide-react";
import { deleteCollection } from "@/actions/collections";
import { NewCollectionForm } from "@/components/NewCollectionForm";
import { Button } from "@/components/ui/button";

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

/** 与广学题库 FilterPanel 一致的筛选按钮：选中实心，未选中描边，text-xs px-3 py-1 */
function Chip({
  href,
  on,
  children,
}: {
  href: string;
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      asChild
      variant={on ? "default" : "outline"}
      size="sm"
      className="px-3 py-1 text-xs"
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 block text-sm font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Sidebar({ collections, counts, active }: Props) {
  const isAll = !active.kind && !active.collection && !active.readState && !active.favorite;

  return (
    <aside className="space-y-6 rounded-xl border border-border bg-card p-4">
      <Group label="状态">
        <Chip href="/" on={isAll}>
          全部 <span className="ml-1 tabular-nums opacity-70">{counts.total}</span>
        </Chip>
        <Chip href="/?readState=unread" on={active.readState === "unread"}>
          未读 <span className="ml-1 tabular-nums opacity-70">{counts.unread}</span>
        </Chip>
        <Chip href="/?favorite=1" on={Boolean(active.favorite)}>
          收藏 <span className="ml-1 tabular-nums opacity-70">{counts.favorite}</span>
        </Chip>
      </Group>

      <Group label="类型">
        <Chip href="/?kind=article" on={active.kind === "article"}>
          文章 <span className="ml-1 tabular-nums opacity-70">{counts.article}</span>
        </Chip>
        <Chip href="/?kind=video" on={active.kind === "video"}>
          视频 <span className="ml-1 tabular-nums opacity-70">{counts.video}</span>
        </Chip>
        <Chip href="/?kind=podcast" on={active.kind === "podcast"}>
          播客 <span className="ml-1 tabular-nums opacity-70">{counts.podcast}</span>
        </Chip>
      </Group>

      <div>
        <p className="mb-3 block text-sm font-medium text-muted-foreground">我的分组</p>
        <div className="flex flex-wrap gap-2">
          {collections.length === 0 ? (
            <p className="text-xs text-muted-foreground">还没有分组</p>
          ) : (
            collections.map((c) => (
              <span key={c.id} className="group inline-flex items-center">
                <Chip href={`/?collection=${c.id}`} on={active.collection === c.id}>
                  {c.name} <span className="ml-1 tabular-nums opacity-70">{c.count}</span>
                </Chip>
                <form action={deleteCollection.bind(null, c.id)}>
                  <button
                    type="submit"
                    aria-label={`删除分组 ${c.name}`}
                    className="ml-1 inline-flex size-7 items-center justify-center rounded text-muted-foreground opacity-60 transition-opacity pointer-fine:size-6 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </form>
              </span>
            ))
          )}
        </div>
        <div className="mt-3">
          <NewCollectionForm />
        </div>
      </div>
    </aside>
  );
}
