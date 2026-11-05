"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export type HighlightState = { ok: boolean; error?: string };

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

  await prisma.highlight.create({
    data: {
      entryId,
      userId: session.userId,
      quote: text,
      note: note.trim().slice(0, 1000) || null,
      anchor: (anchor ?? undefined) as never,
    },
  });

  revalidatePath(`/entry/${entryId}`);
  return { ok: true };
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
