import { prisma } from "@/lib/db";
import { fetchFeed } from "@/lib/rss";
import { extractUrlsFromText, ingestUrls } from "@/lib/ingest";

export type CheckResult = { feedId: number; title: string; added: number; skipped: number };

/** 拉一次订阅：只导入没见过的条目 */
export async function checkFeed(feedId: number): Promise<CheckResult> {
  const feed = await prisma.feed.findUnique({ where: { id: feedId } });
  if (!feed) throw new Error("订阅不存在");

  try {
    const parsed = await fetchFeed(feed.url);
    const fresh = parsed.items.slice(0, 30);
    const urls = extractUrlsFromText(fresh.map((i) => i.url).join("\n"), 30);

    const { added, skipped } = await ingestUrls({
      userId: feed.userId,
      urls,
    });

    if (added > 0) {
      // 新条目自动打上「RSS」标签，方便筛
      const tag = await prisma.tag.upsert({ where: { name: "RSS" }, update: {}, create: { name: "RSS" } });
      const rows = await prisma.entry.findMany({
        where: { userId: feed.userId, url: { in: urls } },
        select: { id: true },
      });
      for (const row of rows) {
        await prisma.entryTag.upsert({
          where: { entryId_tagId: { entryId: row.id, tagId: tag.id } },
          update: {},
          create: { entryId: row.id, tagId: tag.id },
        });
      }
    }

    await prisma.feed.update({
      where: { id: feedId },
      data: { title: parsed.title, lastCheckedAt: new Date(), lastError: null },
    });

    return { feedId, title: parsed.title, added, skipped };
  } catch (error) {
    await prisma.feed.update({
      where: { id: feedId },
      data: { lastCheckedAt: new Date(), lastError: (error as Error).message.slice(0, 300) },
    });
    throw error;
  }
}

/** 找出到期（30 分钟没检查）的订阅，一次最多 5 个 */
export async function dueFeeds(limit = 5) {
  const before = new Date(Date.now() - 30 * 60 * 1000);
  return prisma.feed.findMany({
    where: { enabled: true, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: before } }] },
    orderBy: { lastCheckedAt: "asc" },
    take: limit,
    select: { id: true, url: true, title: true },
  });
}
