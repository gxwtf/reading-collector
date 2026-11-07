// 开放 API：单条详情（MCP / 脚本用）
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWorkerRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // 复用 INTERNAL_API_KEY 之外的 SECRET_API_KEY 校验
  const expected = process.env.SECRET_API_KEY || "";
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || token !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const entry = await prisma.entry.findFirst({
    where: { id: Number(id) },
    include: { transcript: true, tags: { include: { tag: true } } },
  });
  if (!entry) return Response.json({ error: "not found" }, { status: 404 });

  return Response.json({
    entry: {
      id: entry.id,
      title: entry.title,
      url: entry.url,
      site: entry.site,
      kind: entry.kind,
      state: entry.state,
      readState: entry.readState,
      summary: entry.summary,
      contentMd: entry.contentMd,
      transcript: entry.transcript?.text ?? null,
      tags: entry.tags.map((t) => t.tag.name),
    },
  });
}
