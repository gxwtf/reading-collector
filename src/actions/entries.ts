"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export type CreateEntryState = {
  ok: boolean;
  error?: string;
  added?: number;
  skipped?: number;
};

const URL_RE = /https?:\/\/[^\s<>"'）)】，。]+/gi;

/** 按域名粗判类型；真正判定交给 worker */
function detectKind(url: string): "article" | "video" | "podcast" {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  if (/(bilibili\.com|youtu\.be|youtube\.com|vimeo\.com)/.test(host)) return "video";
  if (/(xiaoyuzhoufm\.com|podcasts\.apple\.com|spotify\.com)/.test(host)) return "podcast";
  return "article";
}

/** 与 schema 的 @@unique([userId, urlHash]) 对应 */
function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,，、]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 30),
    ),
  ).slice(0, 10);
}

/** 从一段文本里抠出所有链接，去重并限制数量 */
function extractUrls(text: string, limit = 100): string[] {
  const found = text.match(URL_RE) ?? [];
  const cleaned = found.map((u) => u.replace(/[.,;:!?]+$/, ""));
  return Array.from(new Set(cleaned)).slice(0, limit);
}

async function ensureCollection(userId: number, collectionId: number) {
  const found = await prisma.collection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true },
  });
  return found?.id ?? null;
}

/**
 * 批量收藏：一次粘贴多行链接。
 * 同一用户重复收藏同一 URL 只补标签/分组，不重复建任务。
 */
export async function createEntries(
  _prev: CreateEntryState,
  formData: FormData,
): Promise<CreateEntryState> {
  const session = await requireSession("/");

  const raw = String(formData.get("urls") || "");
  const tags = parseTags(String(formData.get("tags") || ""));
  const collectionRaw = Number(formData.get("collectionId") || 0);
  const collectionId = collectionRaw ? await ensureCollection(session.userId, collectionRaw) : null;

  const urls = extractUrls(raw);
  if (urls.length === 0) {
    return { ok: false, error: "没有识别到链接，请一行一个粘贴 http(s) 地址" };
  }

  let added = 0;
  let skipped = 0;

  for (const url of urls) {
    const urlHash = hashUrl(url);
    const existing = await prisma.entry.findUnique({
      where: { userId_urlHash: { userId: session.userId, urlHash } },
      select: { id: true },
    });

    let entryId: number;

    if (existing) {
      entryId = existing.id;
      skipped += 1;
    } else {
      const kind = detectKind(url);
      const entry = await prisma.entry.create({
        data: {
          userId: session.userId,
          url,
          urlHash,
          title: url,
          kind,
        },
      });
      await prisma.fetchJob.create({
        data: {
          entryId: entry.id,
          url,
          kind: kind === "article" ? "fetch" : "transcribe",
        },
      });
      entryId = entry.id;
      added += 1;
    }

    for (const name of tags) {
      const tag = await prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      });
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

  revalidatePath("/");
  return { ok: true, added, skipped };
}

export async function toggleFavorite(entryId: number) {
  const session = await requireSession("/");
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { favorite: true },
  });
  if (!entry) return;

  await prisma.entry.update({
    where: { id: entryId },
    data: { favorite: !entry.favorite },
  });
  revalidatePath("/");
  revalidatePath(`/entry/${entryId}`);
}

export async function setReadState(entryId: number, readState: "unread" | "reading" | "done") {
  const session = await requireSession("/");
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { id: true },
  });
  if (!entry) return;

  await prisma.entry.update({
    where: { id: entryId },
    data: {
      readState,
      readAt: readState === "done" ? new Date() : null,
    },
  });
  revalidatePath("/");
  revalidatePath(`/entry/${entryId}`);
}

export async function retryFetch(entryId: number) {
  const session = await requireSession("/");
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { id: true, url: true, kind: true },
  });
  if (!entry) return;

  await prisma.entry.update({ where: { id: entryId }, data: { state: "pending" } });
  await prisma.fetchJob.create({
    data: {
      entryId: entry.id,
      url: entry.url,
      kind: entry.kind === "article" ? "fetch" : "transcribe",
    },
  });
  revalidatePath(`/entry/${entryId}`);
  revalidatePath("/");
}

export async function deleteEntry(entryId: number) {
  const session = await requireSession("/");
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { id: true },
  });
  if (!entry) return;

  await prisma.entry.delete({ where: { id: entryId } });
  revalidatePath("/");
}
