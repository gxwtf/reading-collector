import Link from "next/link";
import { Trash2 } from "lucide-react";
import { deleteCollection } from "@/actions/collections";
import { NewCollectionForm } from "@/components/NewCollectionForm";
import { KINDS, kindLabel } from "@/lib/kind";

export type SidebarCounts = {
  total: number;
  unread: number;
  favorite: number;
  article: number;
  video: number;
  podcast: number;
  document: number;
};

type Props = {
  collections: { id: number; name: string; count: number }[];
  counts: SidebarCounts;
  active: { collection?: number; kind?: string; readState?: string; favorite?: boolean };
  /** 移动端横向分类条只要分类，不要「我的分组」与新建表单 */
  compact?: boolean;
};

/**
 * 分类侧栏（设计说明 §4.2）：左文字、右数量，选中项底色加深。
 *
 * 分类用的是项目里真实存在的 kind（article / video / podcast / document），
 * 不照抄设计稿的「图片 / 链接与工具」——库里没有这两种类型，写出来永远是 0。
 */
function Item({
  href,
  on,
  label,
  count,
}: {
  href: string;
  on: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={[
        "flex items-center justify-between gap-2 rounded-[10px] px-3 py-2.5 text-[15px] transition-colors",
        on ? "bg-paper-muted font-medium text-ink" : "text-ink-2 hover:bg-paper-muted/60 hover:text-ink",
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 tabular-nums text-[13px] text-ink-3">{count}</span>
    </Link>
  );
}

export function Sidebar({ collections, counts, active, compact }: Props) {
  const isAll = !active.kind && !active.collection && !active.readState && !active.favorite;

  // 类型项从 KINDS 生成，中文名一律走 kindLabel()——这里曾经硬编码过一份
  // 「文章/视频/播客/文档」，加类型时得改两处（kind.ts 与这里）。
  const items = (
    <>
      <Item href="/" on={isAll} label="全部" count={counts.total} />
      <Item href="/?readState=unread" on={active.readState === "unread"} label="未读" count={counts.unread} />
      <Item href="/?favorite=1" on={Boolean(active.favorite)} label="收藏" count={counts.favorite} />
      {KINDS.map((k) => (
        <Item
          key={k}
          href={`/?kind=${k}`}
          on={active.kind === k}
          label={kindLabel(k)}
          count={counts[k]}
        />
      ))}
    </>
  );

  // 移动端：横向滚动的分类条（§6「小于 768px 时侧栏收为顶部横向滚动的分类条」）
  if (compact) {
    return (
      <nav aria-label="分类" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        <div className="flex gap-1 [&>a]:whitespace-nowrap [&>a]:px-3.5">{items}</div>
      </nav>
    );
  }

  return (
    <aside className="space-y-6">
      <nav aria-label="分类" className="space-y-0.5">
        {items}
      </nav>

      <div>
        <p className="px-3 pb-1.5 text-[13px] text-ink-3">我的分组</p>
        {collections.length === 0 ? (
          <p className="px-3 py-1.5 text-[13px] text-ink-3">还没有分组</p>
        ) : (
          <div className="space-y-0.5">
            {collections.map((c) => (
              <div key={c.id} className="group flex items-center">
                <div className="min-w-0 flex-1">
                  <Item href={`/?collection=${c.id}`} on={active.collection === c.id} label={c.name} count={c.count} />
                </div>
                <form action={deleteCollection.bind(null, c.id)}>
                  <button
                    type="submit"
                    aria-label={`删除分组 ${c.name}`}
                    className="ml-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 opacity-60 transition-opacity hover:text-destructive pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 px-1">
          <NewCollectionForm />
        </div>
      </div>
    </aside>
  );
}
