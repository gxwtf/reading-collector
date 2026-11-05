// 取 B 站直链（视频/音频分离），用于自建播放器。
// 直链约 2 小时过期，缓存 30 分钟。
import type { NextRequest } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const run = promisify(execFile);
const CACHE_TTL = 30 * 60 * 1000;
const cache = new Map<number, { at: number; video: string; audio: string; title: string }>();

const YTDLP = process.env.YTDLP_PATH || "/home/gxwtf/venv_reading/bin/yt-dlp";

async function direct(url: string, format: string) {
  const { stdout } = await run(YTDLP, ["-g", "-f", format, "--no-playlist", url], {
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env },
  });
  const line = stdout
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("http"));
  if (!line) throw new Error("没拿到直链");
  return line;
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return new Response("unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId)) return new Response("bad id", { status: 400 });

  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { url: true, title: true },
  });
  if (!entry) return new Response("not found", { status: 404 });

  const hit = cache.get(entryId);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return Response.json({ video: hit.video, audio: hit.audio, title: hit.title, cached: true });
  }

  try {
    const [video, audio] = await Promise.all([
      direct(entry.url, "bv*[height<=720]/bv*"),
      direct(entry.url, "ba/b"),
    ]);
    cache.set(entryId, { at: Date.now(), video, audio, title: entry.title });
    return Response.json({ video, audio, title: entry.title });
  } catch (error) {
    return Response.json(
      { error: `取直链失败：${(error as Error).message.slice(0, 160)}` },
      { status: 502 },
    );
  }
}
