// HLS 分发：m3u8 与 .ts 分片（Safari / iPad 原生支持）
import type { NextRequest } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MEDIA_DIR = process.env.MEDIA_DIR || "/home/gxwtf/reading-media";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string; path: string[] }> }) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) return new Response("unauthorized", { status: 401 });

  const { id, path: parts } = await ctx.params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId) || parts.length === 0) return new Response("bad request", { status: 400 });

  const file = parts.join("/");
  if (file.includes("..")) return new Response("forbidden", { status: 403 });

  const full = path.join(MEDIA_DIR, String(entryId), file);
  let size = 0;
  try {
    size = statSync(full).size;
  } catch {
    return new Response("not found", { status: 404 });
  }

  const type = file.endsWith(".m3u8")
    ? "application/vnd.apple.mpegurl"
    : file.endsWith(".ts")
      ? "video/mp2t"
      : "application/octet-stream";

  return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
    headers: { "Content-Type": type, "Content-Length": String(size), "Cache-Control": "private, max-age=60" },
  });
}
