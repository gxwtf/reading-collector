import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { deleteTag, renameTag } from "@/actions/tags";

export const metadata: Metadata = { title: "标签管理" };

export default async function TagsPage() {
  const session = await requireSession("/tags");

  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { entryTags: true } } },
  });

  const mine = tags.filter((t) => t._count.entryTags > 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">标签管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          共 {mine.length} 个标签在使用中 · 改名会把旧标签合并到同名标签
        </p>
      </div>

      {mine.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          还没有标签。收藏时填标签，或等自动打标生效。
        </p>
      ) : (
        <ul className="space-y-2">
          {mine.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3"
            >
              <form action={renameTag.bind(null, t.id)} className="flex flex-1 items-center gap-2">
                <input
                  name="name"
                  defaultValue={t.name}
                  className="h-8 w-40 appearance-none rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <button
                  type="submit"
                  className="h-8 rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  保存
                </button>
              </form>

              <span className="text-xs tabular-nums text-muted-foreground">{t._count.entryTags} 条</span>

              <form action={deleteTag.bind(null, t.id)}>
                <button
                  type="submit"
                  aria-label={`删除标签 ${t.name}`}
                  className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        提示：删除标签只会移除标签本身，文章不会被删。
      </p>
    </div>
  );
}
