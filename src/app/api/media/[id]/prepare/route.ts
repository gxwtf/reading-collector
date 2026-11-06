// 精确播放：准备本地 mp4（yt-dlp 下载 + 合并），状态写回 Entry
import type { NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const MEDIA_DIR = process.env.MEDIA_DIR || "/home/gxwtf/reading-media";
const YTDLP = process.env.YTDLP_PATH || "/home/gxwtf/venv_reading/bin/yt-dlp";

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const entryId = Number(id);
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { id: true, url: true, mediaState: true, updatedAt: true },
  });
  if (!entry) return Response.json({ error: "not found" }, { status: 404 });

  // pending 超过 30 分钟视为卡死（服务重启等），允许重新准备
  const stalePending =
    entry.mediaState === "pending" && Date.now() - entry.updatedAt.getTime() > 30 * 60 * 1000;
  if (entry.mediaState === "pending" && !stalePending) return Response.json({ state: "pending" });
  if (entry.mediaState === "ready") return Response.json({ state: "ready" });

  await mkdir(MEDIA_DIR, { recursive: true });
  const target = `${MEDIA_DIR}/${entryId}.mp4`;

  await prisma.entry.update({
    where: { id: entryId },
    data: { mediaState: "pending", mediaError: null },
  });

  // 后台跑 yt-dlp（自带 ffmpeg 合并）
  const child = spawn(
    YTDLP,
    [
      "-f", "bv*[height<=720]+ba/b[height<=720]",
      "--merge-output-format", "mp4",
      "-o", target,
      "--no-playlist",
      "--no-warnings",
      entry.url,
    ],
    { detached: true, stdio: "ignore", env: { ...process.env } },
  );

  child.on("exit", (code) => {
    if (code !== 0) {
      void prisma.entry
        .update({ where: { id: entryId }, data: { mediaState: "failed", mediaError: `yt-dlp 退出码 ${code}` } })
        .catch(() => undefined);
      return;
    }

    // 再切一份 HLS：Safari / iPad 只能稳播 m3u8，Chrome 继续用 mp4
    const hlsDir = `${MEDIA_DIR}/${entryId}`;
    const ff = spawn(
      "ffmpeg",
      [
        "-y",
        "-i", target,
        // B 站给的是 AV1，Safari / HLS 都不支持，必须转 H.264
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-profile:v", "main",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-f", "hls",
        "-hls_time", "6",
        "-hls_playlist_type", "vod",
        "-hls_segment_filename", `${hlsDir}/seg_%03d.ts`,
        `${hlsDir}/index.m3u8`,
      ],
      { detached: true, stdio: "ignore", env: { ...process.env } },
    );

    ff.on("exit", (ffCode) => {
      void prisma.entry
        .update({
          where: { id: entryId },
          data:
            ffCode === 0
              ? { mediaState: "ready", mediaPath: target }
              : { mediaState: "ready", mediaPath: target, mediaError: "HLS 切片失败，仅 mp4 可用" },
        })
        .catch(() => undefined);
    });
    ff.unref();
  });

  child.unref();
  return Response.json({ state: "pending" });
}
