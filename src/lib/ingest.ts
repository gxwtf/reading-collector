import { prisma } from "@/lib/db";
import { detectKind, hashUrl } from "./url";

export { detectKind, hashUrl, parseTags, extractUrlsFromText } from "./url";





export type IngestResult = { added: number; skipped: number };

/**
 * 批量入库：去重、投抓取/转写任务、打标签、放进分组。
 * Server Action 和 /api/v1 共用这一份逻辑。
 */
export async function ingestUrls(options: {
  userId: number;
  urls: string[];
  tags?: string[];
  collectionId?: number | null;
}): Promise<IngestResult> {
  const { userId, urls, tags = [], collectionId = null } = options;

  let added = 0;
  let skipped = 0;

  for (const url of urls) {
    if (!/^https?:\/\//i.test(url)) {
      skipped += 1;
      continue;
    }

    const urlHash = hashUrl(url);
    const existing = await prisma.entry.findUnique({
      where: { userId_urlHash: { userId, urlHash } },
      select: { id: true },
    });

    let entryId: number;

    if (existing) {
      entryId = existing.id;
      skipped += 1;
    } else {
      const kind = detectKind(url);
      const entry = await prisma.entry.create({
        data: { userId, url, urlHash, title: url, kind },
      });
      await prisma.fetchJob.create({
        // 只有音视频走转写，其余（文章/PDF/文档）都走抓取
        data: {
          entryId: entry.id,
          url,
          kind: kind === "video" || kind === "podcast" ? "transcribe" : "fetch",
        },
      });
      entryId = entry.id;
      added += 1;
    }

    for (const name of tags) {
      const tag = await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });
      await prisma.entryTag.upsert({
        where: { entryId_tagId: { entryId, tagId: tag.id } },
        update: {},
        create: { entryId, tagId: tag.id },
      });
    }

    if (collectionId) {
      await prisma.collectionEntry.upsert({
        where: { collectionId_entryId: { collectionId, entryId } },
        update: {},
        create: { collectionId, entryId },
      });
    }
  }

  return { added, skipped };
}
