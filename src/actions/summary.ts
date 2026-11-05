"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { summarizeMarkdown } from "@/lib/summarize";
import { aiSummary, configForUser } from "@/lib/llm";

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

  // 有可用模型就用 AI 概括，失败退回抽取式
  const { cfg } = await configForUser(session.userId);
  let summary = "";
  if (cfg) {
    try {
      summary = await aiSummary(source, cfg);
    } catch (error) {
      console.error("AI 概括失败，回退抽取式", error);
    }
  }
  if (!summary) summary = summarizeMarkdown(source);

  await prisma.entry.update({ where: { id: entryId }, data: { summary } });
  revalidatePath(`/entry/${entryId}`);
}
