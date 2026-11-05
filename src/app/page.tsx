import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { AddEntryForm } from "@/components/AddEntryForm";
import { EntryCard } from "@/components/EntryCard";

export const metadata: Metadata = { title: "我的收藏" };

type SearchParams = Promise<{ readState?: string; favorite?: string }>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession("/");
  const sp = await searchParams;

  const entries = await prisma.entry.findMany({
    where: {
      userId: session.userId,
      ...(sp.readState ? { readState: sp.readState } : {}),
      ...(sp.favorite ? { favorite: true } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      tags: { include: { tag: true } },
    },
  });

  const [total, unread, pending] = await Promise.all([
    prisma.entry.count({ where: { userId: session.userId } }),
    prisma.entry.count({ where: { userId: session.userId, readState: "unread" } }),
    prisma.entry.count({ where: { userId: session.userId, state: "pending" } }),
  ]);

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h1 className="text-xl font-semibold">我的收藏</h1>
        <p className="text-sm text-muted-foreground">
          共 {total} 条 · 未读 {unread} 条
          {pending > 0 ? ` · ${pending} 条正在抓取` : ""}
        </p>
      </section>

      <AddEntryForm />

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          还没有收藏。把一篇想读的文章链接贴到上面，抓取会在后台完成。
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <EntryCard
                entry={{
                  id: entry.id,
                  title: entry.title,
                  url: entry.url,
                  site: entry.site,
                  excerpt: entry.excerpt,
                  kind: entry.kind,
                  state: entry.state,
                  readState: entry.readState,
                  favorite: entry.favorite,
                  wordCount: entry.wordCount,
                  durationSec: entry.durationSec,
                  createdAt: entry.createdAt,
                  tags: entry.tags.map((t) => t.tag.name),
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
