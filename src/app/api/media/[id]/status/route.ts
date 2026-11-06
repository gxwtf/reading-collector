// 精确播放状态轮询
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const entry = await prisma.entry.findFirst({
    where: { id: Number(id), userId: session.userId },
    select: { mediaState: true, mediaError: true },
  });
  if (!entry) return Response.json({ error: "not found" }, { status: 404 });

  return Response.json({ state: entry.mediaState, error: entry.mediaError });
}
