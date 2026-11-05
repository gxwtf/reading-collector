// 逐字稿词级时间戳：客户端按需拉取，避免把上千个词塞进页面 RSC 负载
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type Segment = {
  start?: number;
  end?: number;
  text?: string;
  words?: { start?: number; end?: number; text?: string }[];
};

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return new Response("unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId)) return new Response("bad id", { status: 400 });

  const transcript = await prisma.transcript.findFirst({
    where: { entryId, entry: { userId: session.userId } },
    select: { segments: true },
  });
  if (!transcript) return new Response("not found", { status: 404 });

  const segments = Array.isArray(transcript.segments) ? (transcript.segments as Segment[]) : [];

  // 与前端一致：60 秒聚合成段，词按段切分
  const words: [number, number, string][] = [];
  const chunks: { start: number; from: number; to: number }[] = [];

  for (const seg of segments) {
    const segStart = Number(seg.start ?? 0);
    const segWords = (seg.words ?? [])
      .map((w) => ({
        start: Number(w.start ?? segStart),
        end: Number(w.end ?? segStart),
        text: w.text ?? "",
      }))
      .filter((w) => w.text.trim().length > 0);

    if (segWords.length === 0 && !(seg.text ?? "").trim()) continue;

    const last = chunks[chunks.length - 1];
    if (!last || segStart - last.start >= 60) {
      chunks.push({ start: segStart, from: words.length, to: words.length });
    }
    const chunk = chunks[chunks.length - 1];

    if (segWords.length > 0) {
      for (const w of segWords) words.push([w.start, w.end, w.text]);
    } else {
      words.push([segStart, Number(seg.end ?? segStart), ` ${(seg.text ?? "").trim()}`]);
    }
    chunk.to = words.length;
  }

  return Response.json({ chunks, words });
}
