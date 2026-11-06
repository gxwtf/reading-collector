"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { extractUrlsFromText, ingestUrls, parseTags } from "@/lib/ingest";

export type CreateEntryState = {
  ok: boolean;
  error?: string;
  added?: number;
  skipped?: number;
};


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

  const urls = extractUrlsFromText(raw);
  if (urls.length === 0) {
    return { ok: false, error: "没有识别到链接，请一行一个粘贴 http(s) 地址" };
  }

  const { added, skipped } = await ingestUrls({
    userId: session.userId,
    urls,
    tags,
    collectionId,
  });

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

/* ---------------- 批量管理 ---------------- */

async function ownedIds(ids: number[], userId: number) {
  const rows = await prisma.entry.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function bulkSetReadState(ids: number[], readState: "unread" | "reading" | "done") {
  const session = await requireSession("/");
  const owned = await ownedIds(ids, session.userId);
  if (owned.length === 0) return;

  await prisma.entry.updateMany({
    where: { id: { in: owned }, userId: session.userId },
    data: { readState, readAt: readState === "done" ? new Date() : null },
  });
  revalidatePath("/");
}

export async function bulkDelete(ids: number[]) {
  const session = await requireSession("/");
  const owned = await ownedIds(ids, session.userId);
  if (owned.length === 0) return;

  await prisma.entry.deleteMany({ where: { id: { in: owned }, userId: session.userId } });
  revalidatePath("/");
}

export async function bulkAddToCollection(ids: number[], collectionId: number) {
  const session = await requireSession("/");
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, userId: session.userId },
    select: { id: true },
  });
  if (!collection) return;

  const owned = await ownedIds(ids, session.userId);
  for (const entryId of owned) {
    await prisma.collectionEntry.upsert({
      where: { collectionId_entryId: { collectionId, entryId } },
      update: {},
      create: { collectionId, entryId },
    });
  }
  revalidatePath("/");
}

export async function bulkRemoveFromCollection(ids: number[], collectionId: number) {
  const session = await requireSession("/");
  const owned = await ownedIds(ids, session.userId);
  if (owned.length === 0) return;

  await prisma.collectionEntry.deleteMany({
    where: { entryId: { in: owned }, collectionId },
  });
  revalidatePath("/");
}
