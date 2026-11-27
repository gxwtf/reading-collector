"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireSession } from "@/lib/session";

export type HighlightState = { ok: boolean; error?: string; id?: number };

/** 新建划线 / 批注 */
export async function createHighlight(
  entryId: number,
  quote: string,
  note: string,
  anchor: { block: number; start: number; end: number } | null,
): Promise<HighlightState> {
  const session = await requireSession("/");

  const text = quote.trim().slice(0, 2000);
  if (!text) return { ok: false, error: "没有选中文字" };

  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { id: true },
  });
  if (!entry) return { ok: false, error: "条目不存在" };

  const created = await prisma.highlight.create({
    data: {
      entryId,
      userId: session.userId,
      quote: text,
      note: note.trim().slice(0, 1000) || null,
      ...(anchor ? { anchor: anchor as Prisma.InputJsonValue } : {}),
    },
    select: { id: true },
  });

  revalidatePath(`/entry/${entryId}`);
  // 把 id 带回前端：正文要立刻把这段字画成黄底，不用等服务端整页刷新
  return { ok: true, id: created.id };
}

export async function deleteHighlight(highlightId: number) {
  const session = await requireSession("/");

  const found = await prisma.highlight.findFirst({
    where: { id: highlightId, userId: session.userId },
    select: { id: true, entryId: true },
  });
  if (!found) return;

  await prisma.highlight.delete({ where: { id: found.id } });
  revalidatePath(`/entry/${found.entryId}`);
}
