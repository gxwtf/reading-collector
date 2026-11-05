"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export type CreateEntryState = { ok: boolean; error?: string };

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
        .split(/[,，、\s]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 30),
    ),
  ).slice(0, 10);
}

/**
 * 收藏一条链接：写入 Entry 并投递抓取任务。
 * 同一个用户重复收藏同一 URL 只更新标签，不重复抓取。
 */
export async function createEntry(
  _prev: CreateEntryState,
  formData: FormData,
): Promise<CreateEntryState> {
  const session = await requireSession("/");

  const url = String(formData.get("url") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const tags = parseTags(String(formData.get("tags") || ""));

  if (!/^https?:\/\/\S+$/i.test(url)) {
    return { ok: false, error: "请填写以 http(s):// 开头的链接" };
  }

  const kind = detectKind(url);
  const urlHash = hashUrl(url);

  try {
    const entry = await prisma.entry.upsert({
      where: { userId_urlHash: { userId: session.userId, urlHash } },
      update: {},
      create: {
        userId: session.userId,
        url,
        urlHash,
        title: title || url,
        kind,
      },
    });

    for (const name of tags) {
      const tag = await prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      await prisma.entryTag.upsert({
        where: { entryId_tagId: { entryId: entry.id, tagId: tag.id } },
        update: {},
        create: { entryId: entry.id, tagId: tag.id },
      });
    }

    // 只有还没抓过（或上次失败）才投递任务
    const shouldEnqueue = entry.state === "pending" || entry.state === "failed";
    if (shouldEnqueue) {
      await prisma.fetchJob.create({
        data: {
          entryId: entry.id,
          url,
          kind: kind === "article" ? "fetch" : "transcribe",
        },
      });
      await prisma.entry.update({
        where: { id: entry.id },
        data: { state: "pending" },
      });
    }

    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    console.error("createEntry failed", error);
    return { ok: false, error: "入库失败，请稍后再试" };
  }
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
