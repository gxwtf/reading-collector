"use server";

import { shortCode } from "@/lib/shortcode";
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

  let token: string | null = null;
  if (!entry.shareToken) {
    // 短码：7 位，撞了就重生成（概率极低）
    for (let i = 0; i < 5; i += 1) {
      const candidate = shortCode();
      const taken = await prisma.entry.findUnique({
        where: { shareToken: candidate },
        select: { id: true },
      });
      if (!taken) {
        token = candidate;
        break;
      }
    }
  }

  await prisma.entry.update({
    where: { id: entry.id },
    data: { shareToken: token },
  });
  revalidatePath(`/entry/${entryId}`);
}
