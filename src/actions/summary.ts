"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { summarizeMarkdown } from "@/lib/summarize";
import { aiSummary, configsForUser } from "@/lib/llm";

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

  // 有可用模型就用 AI 概括；多把 key 依次尝试，全失败再退回抽取式
  const { cfgs } = await configsForUser(session.userId);
  let summary = "";
  for (const cfg of cfgs) {
    try {
      summary = await aiSummary(source, cfg);
      break;
    } catch (error) {
      console.error("AI 概括失败，换下一把 key", (error as Error).message.slice(0, 120));
    }
  }
  if (!summary) summary = summarizeMarkdown(source);

  await prisma.entry.update({ where: { id: entryId }, data: { summary } });
  revalidatePath(`/entry/${entryId}`);
}
