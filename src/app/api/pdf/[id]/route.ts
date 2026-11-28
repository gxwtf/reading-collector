// PDF 原样查看：GET /api/pdf/<entryId>
//
// 为什么不让浏览器直连原站 URL：
//   1. 很多站禁外链/要 Referer，直连是 403 或空白
//   2. 原站挂掉后收藏就废了，本地副本才是真数据
//   3. 直连会把「用户看过什么」暴露给第三方
//
// 安全约束（与 /api/media 同一套）：
//   - 必须登录，且只能看自己的条目（where 带 userId）
//   - pdfPath 只接受服务端自己写进库的绝对路径，不接受任何用户输入
//   - 支持 Range：PDF.js 加载大文件时要按需取片段，不给 Range 会整份塞进内存
import type { NextRequest } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** pdfPath 必须落在允许的目录里，防止库里被塞了奇怪的路径 */
const PDF_DIR = process.env.PDF_DIR || "/home/gxwtf/reading-pdfs";

function underPdfDir(p: string): boolean {
  // 用 path.relative 判断，而不是字符串前缀：Windows 用反斜杠、大小写不敏感，
  // 手拼 "dir/" 前缀那种写法在 Windows 上会把合法路径判成越界。
  const rel = path.relative(path.resolve(PDF_DIR), path.resolve(p));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function loadOwned(entryId: number, userId: number) {
  return prisma.entry.findFirst({
    where: { id: entryId, userId },
    select: { pdfPath: true, title: true },
  });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId)) return Response.json({ error: "bad id" }, { status: 400 });

  const entry = await loadOwned(entryId, session.userId);
  // 别人的条目一律当不存在，不区分 403/404——避免探测「这个 id 有没有」
  if (!entry?.pdfPath) return Response.json({ error: "not found" }, { status: 404 });
  if (!underPdfDir(entry.pdfPath)) {
    console.error("[pdf] pdfPath 越界", entry.pdfPath);
    return Response.json({ error: "not found" }, { status: 404 });
  }

  let size = 0;
  try {
    size = statSync(entry.pdfPath).size;
  } catch {
    return Response.json({ error: "原文件不在服务器上了" }, { status: 404 });
  }

  const base = {
    "Content-Type": "application/pdf",
    "Accept-Ranges": "bytes",
    // 同源内嵌用，别让别的站嵌进去
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=300",
  };

  const range = request.headers.get("range");
  if (!range) {
    return new Response(Readable.toWeb(createReadStream(entry.pdfPath)) as ReadableStream, {
      headers: { ...base, "Content-Length": String(size) },
    });
  }

  const m = /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return new Response("bad range", { status: 416 });

  // "bytes=-500" 表示最后 500 字节；"bytes=0-" 表示从 0 到末尾
  let start = m[1] ? Number(m[1]) : size - Number(m[2] || 0);
  let end = m[2] && m[1] ? Number(m[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(size - 1, Math.max(start, end));
  if (start > end) return new Response("range not satisfiable", { status: 416 });

  return new Response(
    Readable.toWeb(createReadStream(entry.pdfPath, { start, end })) as ReadableStream,
    {
      status: 206,
      headers: {
        ...base,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
    },
  );
}

export async function HEAD(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) return new Response(null, { status: 401 });

  const { id } = await ctx.params;
  const entry = await loadOwned(Number(id), session.userId);
  if (!entry?.pdfPath || !underPdfDir(entry.pdfPath)) return new Response(null, { status: 404 });

  try {
    const size = statSync(entry.pdfPath).size;
    return new Response(null, {
      headers: { "Content-Type": "application/pdf", "Content-Length": String(size), "Accept-Ranges": "bytes" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
