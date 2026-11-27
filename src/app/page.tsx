import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { EntryList } from "@/components/EntryList";
import { FetchProgress } from "@/components/FetchProgress";
import { BilibiliFavImport } from "@/components/BilibiliFavImport";
import { EpubImport } from "@/components/EpubImport";
import { MarkdownImport } from "@/components/MarkdownImport";
import { OpmlImport } from "@/components/OpmlImport";
import { FeedList } from "@/components/FeedList";
import { Sidebar } from "@/components/Sidebar";
import { DropZone } from "@/components/DropZone";
import { isKind, kindLabel } from "@/lib/kind";

export const metadata: Metadata = { title: "稍后再看" };

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
  const kind = isKind(sp.kind) ? sp.kind : undefined;

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

  const counts = {
    total,
    unread,
    favorite: favoriteCount,
    article: kindCount("article"),
    video: kindCount("video"),
    podcast: kindCount("podcast"),
    document: kindCount("document"),
  };
  const collectionOptions = collections.map((c) => ({ id: c.id, name: c.name }));
  const sidebarCollections = collections.map((c) => ({
    id: c.id,
    name: c.name,
    count: c._count.entries,
  }));
  const active = {
    collection: collectionId,
    kind,
    readState: sp.readState,
    favorite: Boolean(sp.favorite),
  };

  const heading = q
    ? `搜索：${q}`
    : collectionId
      ? (collections.find((c) => c.id === collectionId)?.name ?? "分组")
      : kind
        ? kindLabel(kind)
        : sp.readState === "unread"
          ? "未读"
          : sp.favorite
            ? "收藏"
            : "全部收藏";

  return (
    <div className="grid gap-10 md:grid-cols-[200px_minmax(0,1fr)]">
      {/* 桌面侧栏：sticky 需要 self-start，否则会被 grid 拉伸到内容高度 */}
      <div className="hidden md:sticky md:top-24 md:block md:self-start">
        <Sidebar collections={sidebarCollections} counts={counts} active={active} />
      </div>

      <div className="min-w-0 space-y-7">
        {/* 移动端：横向滚动的分类条 */}
        <div className="md:hidden">
          <Sidebar
            collections={[]}
            counts={counts}
            active={active}
            compact
          />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-serif text-[26px] font-semibold leading-tight text-ink">{heading}</h1>
          <p className="text-[13px] text-ink-3">
            {entries.length} 条{entries.length === 100 ? "（只显示最近 100 条）" : ""}
          </p>
        </div>

        <DropZone collections={collectionOptions} activeCollectionId={collectionId} />

        <FetchProgress
          pending={Math.max(0, pending - runningJobs)}
          running={runningJobs}
          ready={ready}
          failed={failed}
        />

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
          collections={collectionOptions}
          activeCollectionId={collectionId}
          searchQuery={q || undefined}
        />

        {/* 功能入口整体后置：默认折叠，不抢首页的视觉重心（用户选择「保留功能入口，只重排版式」） */}
        <details className="rounded-2xl border border-hairline bg-card px-5 py-4">
          <summary className="cursor-pointer list-none text-[14px] text-ink-2 transition-colors hover:text-ink">
            更多导入方式 / RSS 订阅
          </summary>
          <div className="mt-4 space-y-4">
            <BilibiliFavImport />
            <MarkdownImport />
            <EpubImport />
            <OpmlImport />
            <FeedList />
          </div>
        </details>
      </div>
    </div>
  );
}
