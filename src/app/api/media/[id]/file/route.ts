// 本地 mp4 播放（支持 Range）
import type { NextRequest } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) return new Response("unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const entryId = Number(id);
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { mediaPath: true, mediaState: true },
  });
  if (!entry?.mediaPath || entry.mediaState !== "ready") {
    return new Response("not ready", { status: 404 });
  }

  let size = 0;
  try {
    size = statSync(entry.mediaPath).size;
  } catch {
    return new Response("missing file", { status: 404 });
  }

  const range = request.headers.get("range");
  if (!range) {
    return new Response(Readable.toWeb(createReadStream(entry.mediaPath)) as ReadableStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = /bytes=(\d+)-(\d*)/.exec(range);
  const start = match ? Number(match[1]) : 0;
  const end = match && match[2] ? Number(match[2]) : size - 1;
  const chunk = end - start + 1;

  return new Response(
    Readable.toWeb(createReadStream(entry.mediaPath, { start, end })) as ReadableStream,
    {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(chunk),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
      },
    },
  );
}

export async function HEAD(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) return new Response(null, { status: 401 });

  const { id } = await ctx.params;
  const entry = await prisma.entry.findFirst({
    where: { id: Number(id), userId: session.userId },
    select: { mediaPath: true, mediaState: true },
  });
  if (!entry?.mediaPath || entry.mediaState !== "ready") return new Response(null, { status: 404 });

  const size = statSync(entry.mediaPath).size;
  return new Response(null, {
    headers: { "Content-Type": "video/mp4", "Content-Length": String(size), "Accept-Ranges": "bytes" },
  });
}
