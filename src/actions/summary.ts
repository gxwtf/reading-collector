"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { summarizeMarkdown } from "@/lib/summarize";

/** 重新生成概括（手动触发；worker 抓取完成时也会自动写一份） */
export async function regenerateSummary(entryId: number) {
  const session = await requireSession("/");

  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { id: true, contentMd: true, transcript: { select: { text: true } } },
  });
  if (!entry) return;

  const source = entry.contentMd?.trim() || entry.transcript?.text?.trim() || "";
  if (source.length < 80) return;

  const summary = summarizeMarkdown(source);
  await prisma.entry.update({ where: { id: entryId }, data: { summary } });
  revalidatePath(`/entry/${entryId}`);
}
