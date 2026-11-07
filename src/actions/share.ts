"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

/** 生成/撤销公开分享链接 */
export async function toggleShare(entryId: number) {
  const session = await requireSession(`/entry/${entryId}`);

  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { id: true, shareToken: true },
  });
  if (!entry) return;

  await prisma.entry.update({
    where: { id: entry.id },
    data: { shareToken: entry.shareToken ? null : randomBytes(8).toString("hex") },
  });
  revalidatePath(`/entry/${entryId}`);
}
