"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { summarizeMarkdown } from "@/lib/summarize";
import { aiSummary, configsForUser } from "@/lib/llm";

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type Segment = { start?: number; end?: number; text?: string };

/** 逐字稿转成「时间戳 + 文本」的原料，让模型能引用 [mm:ss] */
function timestampedTranscript(segments: unknown, fallback: string): string {
  const list = Array.isArray(segments) ? (segments as Segment[]) : [];
  const cleaned = list.filter((s) => (s.text ?? "").trim().length > 0);
  if (cleaned.length === 0) return fallback;

  const lines: string[] = [];
  let start = Number(cleaned[0].start ?? 0);
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    lines.push(`[${mmss(start)}] ${buffer.join(" ").replace(/\s+/g, " ").trim()}`);
    buffer = [];
  };

  for (const seg of cleaned) {
    const t = Number(seg.start ?? 0);
    if (buffer.length > 0 && t - start >= 45) {
      flush();
      start = t;
    }
    buffer.push((seg.text ?? "").trim());
  }
  flush();

  return lines.join("\n");
}

/** 重新生成概括（手动触发；worker 抓取完成时也会自动写一份抽取式） */
export async function regenerateSummary(entryId: number) {
  const session = await requireSession("/");

  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: {
      id: true,
      kind: true,
      contentMd: true,
      transcript: { select: { text: true, segments: true } },
    },
  });
  if (!entry) return;

  const isVideo = entry.kind === "video" || entry.kind === "podcast";
  const source = isVideo
    ? timestampedTranscript(entry.transcript?.segments, entry.transcript?.text ?? entry.contentMd ?? "")
    : (entry.contentMd?.trim() || entry.transcript?.text?.trim() || "");

  if (source.length < 80) return;

  // 有可用模型就用 AI 概括；多把 key 依次尝试，全失败再退回抽取式
  const { cfgs } = await configsForUser(session.userId);
  let summary = "";
  for (const cfg of cfgs) {
    try {
      summary = await aiSummary(source, cfg, {
        kind: entry.kind === "article" ? "article" : "video",
      });
      break;
    } catch (error) {
      console.error("AI 概括失败，换下一把 key", (error as Error).message.slice(0, 120));
    }
  }
  if (!summary) summary = summarizeMarkdown(source);

  await prisma.entry.update({ where: { id: entryId }, data: { summary } });
  revalidatePath(`/entry/${entryId}`);
}
