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

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  const kind = new URL(request.url).searchParams.get("kind") as "video" | "audio" | null;

  let hit = cache.get(entryId);
  if (!hit || Date.now() - hit.at >= CACHE_TTL) {
    try {
      const [video, audio] = await Promise.all([
        direct(entry.url, "bv*[height<=720]/bv*/b"),
        direct(entry.url, "ba/bestaudio/b"),
      ]);
      hit = { at: Date.now(), video, audio, title: entry.title };
      cache.set(entryId, hit);
    } catch (error) {
      return Response.json(
        { error: `取直链失败：${(error as Error).message.slice(0, 160)}` },
        { status: 502 },
      );
    }
  }

  // 没有 kind：返回元数据（实际播放走本代理，B 站 CDN 要求 Referer 与 UA）
  if (!kind) {
    return Response.json({
      video: `/api/media/${entryId}?kind=video`,
      audio: `/api/media/${entryId}?kind=audio`,
      title: entry.title,
    });
  }

  // 代理流：补上 Referer/UA，透传 Range
  const target = kind === "video" ? hit.video : hit.audio;
  const range = request.headers.get("range") ?? undefined;
  let upstream = await fetch(target, {
    headers: {
      Referer: "https://www.bilibili.com/",
      "User-Agent": UA,
      ...(range ? { Range: range } : {}),
    },
    cache: "no-store",
  });

  // 直链过期会返 403：清缓存重取一次
  if (upstream.status === 403 || upstream.status === 404) {
    cache.delete(entryId);
    try {
      const [video, audio] = await Promise.all([
        direct(entry.url, "bv*[height<=720]/bv*/b"),
        direct(entry.url, "ba/bestaudio/b"),
      ]);
      cache.set(entryId, { at: Date.now(), video, audio, title: entry.title });
      const fresh = kind === "video" ? video : audio;
      upstream = await fetch(fresh, {
        headers: {
          Referer: "https://www.bilibili.com/",
          "User-Agent": UA,
          ...(range ? { Range: range } : {}),
        },
        cache: "no-store",
      });
    } catch {
      // 保持原响应
    }
  }

  const headers = new Headers();
  // 浏览器对 application/octet-stream 的 <audio>/<video> 可能拒播，显式给出类型
  headers.set("Content-Type", kind === "audio" ? "audio/mp4" : "video/mp4");
  headers.set("Accept-Ranges", "bytes");
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new Response(upstream.body, { status: upstream.status, headers });
}
