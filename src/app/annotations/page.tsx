import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareQuote, Search } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "批注整理" };

type SearchParams = Promise<{ q?: string; notes?: string }>;

function fmt(date: Date) {
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export default async function AnnotationsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession("/annotations");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const onlyNotes = sp.notes === "1";

  const highlights = await prisma.highlight.findMany({
    where: {
      userId: session.userId,
      ...(onlyNotes ? { note: { not: null } } : {}),
      ...(q
        ? {
            OR: [
              { quote: { contains: q, mode: "insensitive" as const } },
              { note: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      entry: { select: { id: true, title: true, site: true } },
    },
  });

  // 按条目归组，组内保持「最近批注在前」
  const groups = new Map<
    number,
    { entry: { id: number; title: string; site: string | null }; items: typeof highlights }
  >();
  for (const h of highlights) {
    const g = groups.get(h.entryId) ?? {
      entry: { id: h.entry.id, title: h.entry.title, site: h.entry.site },
      items: [] as typeof highlights,
    };
    g.items.push(h);
    groups.set(h.entryId, g);
  }

  const totalNotes = highlights.filter((h) => h.note && h.note.trim()).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">批注整理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {highlights.length} 条划线 · {totalNotes} 条带批注 · 涉及 {groups.size} 篇
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={
              onlyNotes
                ? `/annotations${q ? `?q=${encodeURIComponent(q)}` : ""}`
                : `/annotations?notes=1${q ? `&q=${encodeURIComponent(q)}` : ""}`
            }
            className={`rounded-md border px-2 py-1 text-xs ${
              onlyNotes
                ? "border-brand-red/40 bg-brand-red/10 text-brand-red"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            只看有批注
          </Link>
          <form action="/annotations" className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="搜索批注或划线"
            className="h-9 w-56 rounded-md border border-input bg-background pl-7 pr-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          </form>
        </div>
      </div>

      {highlights.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {q ? "没有匹配的批注" : "还没有划线。打开任意文章，选中文字就能划线与批注。"}
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(groups.values()).map(({ entry, items }) => (
            <section key={entry.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/entry/${entry.id}`}
                  className="min-w-0 truncate font-medium hover:text-brand-red"
                  title={entry.title}
                >
                  {entry.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {entry.site ?? ""} · {items.length} 条
                </span>
              </div>

              <ul className="mt-3 space-y-2">
                {items.map((h) => (
                  <li key={h.id} className="rounded-md border border-border/60 px-3 py-2">
                    <p className="border-l-2 border-brand-red/60 pl-2 text-sm leading-6">{h.quote}</p>
                    {h.note ? (
                      <p className="mt-1 flex gap-1.5 pl-2 text-xs text-muted-foreground">
                        <MessageSquareQuote className="mt-0.5 size-3.5 shrink-0" />
                        {h.note}
                      </p>
                    ) : null}
                    <p className="mt-1 pl-2 text-[11px] text-muted-foreground">
                      {fmt(h.createdAt)} ·{" "}
                      <Link href={`/entry/${entry.id}`} className="hover:underline">
                        回原文
                      </Link>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
