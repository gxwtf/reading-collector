"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function addKeyframe(entryId: number, timeSec: number, note: string) {
  const session = await requireSession(`/entry/${entryId}`);

  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { id: true },
  });
  if (!entry) return;

  await prisma.keyframe.create({
    data: {
      entryId,
      userId: session.userId,
      timeSec: Math.max(0, Math.round(timeSec * 10) / 10),
      note: note.trim().slice(0, 200) || null,
    },
  });
  revalidatePath(`/entry/${entryId}`);
}

export async function deleteKeyframe(id: number) {
  const session = await requireSession("/");

  const found = await prisma.keyframe.findFirst({
    where: { id, userId: session.userId },
    select: { id: true, entryId: true },
  });
  if (!found) return;

  await prisma.keyframe.delete({ where: { id: found.id } });
  revalidatePath(`/entry/${found.entryId}`);
}
