// 上传本地字幕（VTT / SRT）：从第三方站下载的字幕文件直接挂到条目上
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { parseSubtitle } from "@/lib/subtitle";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const entryId = Number(id);
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { id: true },
  });
  if (!entry) return Response.json({ error: "not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "没有收到字幕文件" }, { status: 400 });

  const text = await file.text();
  const segments = parseSubtitle(text);
  if (segments.length < 3) return Response.json({ error: "字幕解析失败或内容过少" }, { status: 400 });

  const plain = segments.map((s) => s.text).join(" ");

  await prisma.transcript.upsert({
    where: { entryId },
    update: { locale: "zh-CN", backend: "upload", text: plain, segments: segments as never },
    create: { entryId, locale: "zh-CN", backend: "upload", text: plain, segments: segments as never },
  });

  await prisma.entry.update({ where: { id: entryId }, data: { state: "ready" } });

  return Response.json({ ok: true, segments: segments.length, chars: plain.length });
}
