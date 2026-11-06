import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { AddEntryForm } from "@/components/AddEntryForm";
import { EntryList } from "@/components/EntryList";
import { FetchProgress } from "@/components/FetchProgress";
import { BilibiliFavImport } from "@/components/BilibiliFavImport";
import { MarkdownImport } from "@/components/MarkdownImport";
import { FeedList } from "@/components/FeedList";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = { title: "我的收藏" };

type SearchParams = Promise<{
  readState?: string;
  favorite?: string;
  kind?: string;
  collection?: string;
  q?: string;
}>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession("/");
  const sp = await searchParams;
  const userId = session.userId;

  const collectionId = Number(sp.collection || 0) || undefined;
  const q = (sp.q || "").trim().slice(0, 60);
  const kind = sp.kind && ["article", "video", "podcast"].includes(sp.kind) ? sp.kind : undefined;

  const where = {
    userId,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { excerpt: { contains: q, mode: "insensitive" as const } },
            { contentMd: { contains: q, mode: "insensitive" as const } },
            { site: { contains: q, mode: "insensitive" as const } },
            { transcript: { is: { text: { contains: q, mode: "insensitive" as const } } } },
            {
              highlights: {
                some: {
                  OR: [
                    { quote: { contains: q, mode: "insensitive" as const } },
                    { note: { contains: q, mode: "insensitive" as const } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
    ...(sp.readState ? { readState: sp.readState } : {}),
    ...(sp.favorite ? { favorite: true } : {}),
    ...(kind ? { kind } : {}),
    ...(collectionId ? { collections: { some: { collectionId } } } : {}),
  };

  const [entries, collections, kindGroups, stateGroups, unread, favoriteCount, runningJobs] =
    await Promise.all([
      prisma.entry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          tags: { include: { tag: true } },
          jobs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
        },
      }),
      prisma.collection.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { entries: true } } },
      }),
      prisma.entry.groupBy({ by: ["kind"], where: { userId }, _count: { _all: true } }),
      prisma.entry.groupBy({ by: ["state"], where: { userId }, _count: { _all: true } }),
      prisma.entry.count({ where: { userId, readState: "unread" } }),
      prisma.entry.count({ where: { userId, favorite: true } }),
      prisma.fetchJob.count({ where: { status: "running", entry: { userId } } }),
    ]);

  const kindCount = (k: string) => kindGroups.find((g) => g.kind === k)?._count._all ?? 0;
  const stateCount = (s: string) => stateGroups.find((g) => g.state === s)?._count._all ?? 0;

  const total = stateGroups.reduce((sum, g) => sum + g._count._all, 0);
  const pending = stateCount("pending");
  const ready = stateCount("ready");
  const failed = stateCount("failed");

  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <div className="hidden md:block">
      <Sidebar
        collections={collections.map((c) => ({ id: c.id, name: c.name, count: c._count.entries }))}
        counts={{
          total,
          unread,
          favorite: favoriteCount,
          article: kindCount("article"),
          video: kindCount("video"),
          podcast: kindCount("podcast"),
        }}
        active={{ collection: collectionId, kind, readState: sp.readState, favorite: Boolean(sp.favorite) }}
      />
      </div>

      <details className="rounded-xl bg-card ring-1 ring-foreground/10 p-3 md:hidden">
        <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground">筛选 / 分组</summary>
        <div className="mt-3">
      <Sidebar
        collections={collections.map((c) => ({ id: c.id, name: c.name, count: c._count.entries }))}
        counts={{
          total,
          unread,
          favorite: favoriteCount,
          article: kindCount("article"),
          video: kindCount("video"),
          podcast: kindCount("podcast"),
        }}
        active={{ collection: collectionId, kind, readState: sp.readState, favorite: Boolean(sp.favorite) }}
      />
        </div>
      </details>

      <div className="min-w-0 space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">
            {q
              ? `搜索：${q}`
              : collectionId
              ? (collections.find((c) => c.id === collectionId)?.name ?? "分组")
              : kind
                ? { article: "文章", video: "视频", podcast: "播客" }[kind as "article" | "video" | "podcast"]
                : sp.readState === "unread"
                  ? "未读"
                  : sp.favorite
                    ? "收藏"
                    : "我的收藏"}
          </h1>
          <p className="text-sm text-muted-foreground">
            共 {entries.length} 条{entries.length === 100 ? "（只显示最近 100 条）" : ""}
          </p>
        </div>

        <FetchProgress
          pending={Math.max(0, pending - runningJobs)}
          running={runningJobs}
          ready={ready}
          failed={failed}
        />

        <AddEntryForm collections={collections.map((c) => ({ id: c.id, name: c.name }))} />
        <details className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
          <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground">
            更多导入方式（B 站收藏夹 / 合集 / RSS / Markdown）
          </summary>
          <div className="mt-3 space-y-3">
            <BilibiliFavImport />
            <MarkdownImport />
          </div>
        </details>
        <FeedList />

        <EntryList
          entries={entries.map((entry) => ({
            id: entry.id,
            title: entry.title,
            url: entry.url,
            site: entry.site,
            excerpt: entry.excerpt,
            kind: entry.kind,
            state: entry.state,
            jobStatus: entry.jobs[0]?.status ?? null,
            readState: entry.readState,
            favorite: entry.favorite,
            wordCount: entry.wordCount,
            durationSec: entry.durationSec,
            createdAt: entry.createdAt.toISOString(),
            tags: entry.tags.map((t) => t.tag.name),
          }))}
          collections={collections.map((c) => ({ id: c.id, name: c.name }))}
          activeCollectionId={collectionId}
        />
      </div>
    </div>
  );
}
