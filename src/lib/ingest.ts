import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

/** 按域名粗判类型；真正判定交给 worker */
export function detectKind(url: string): "article" | "video" | "podcast" {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "article";
  }
  if (/(bilibili\.com|youtu\.be|youtube\.com|vimeo\.com)/.test(host)) return "video";
  if (/(xiaoyuzhoufm\.com|podcasts\.apple\.com|spotify\.com)/.test(host)) return "podcast";
  return "article";
}

export function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,，、]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 30),
    ),
  ).slice(0, 10);
}

const URL_RE = /https?:\/\/[^\s<>"'）)】，。]+/gi;

/** 从一段文本里抠链接（去重、限 100 条） */
export function extractUrlsFromText(text: string, limit = 100): string[] {
  const found = text.match(URL_RE) ?? [];
  const cleaned = found.map((u) => u.replace(/[.,;:!?]+$/, ""));
  return Array.from(new Set(cleaned)).slice(0, limit);
}

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
        data: { entryId: entry.id, url, kind: kind === "article" ? "fetch" : "transcribe" },
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
