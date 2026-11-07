import { createHmac, timingSafeEqual } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";

const SUPPORTED = new Set(["epub", "pdf", "cbz", "cbr", "mobi", "azw3", "fb2"]);

export const BOOKS_DIR = process.env.READEST_BOOKS_DIR || "/home/gxwtf/reading-books";

export const SYNC_USER_ID = Number(process.env.API_USER_ID || 2691);

const SECRET = process.env.SECRET_API_KEY || "readest-dev";

/** 无时区的本地时间，Readest 期望 `2026-11-05T14:04:52` */
export function fmt(d: Date | null | undefined): string | null {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

export function signToken(userId: number): string {
  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ userId, exp })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(req: Request): boolean {
  const raw = req.headers.get("authorization") || "";
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  const want = createHmac("sha256", SECRET).update(payload).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return false;
  } catch {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number };
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function extOf(fileName: string): string {
  return path.extname(fileName).replace(".", "").toLowerCase();
}

export function bookType(ext: string): string {
  if (ext === "cbz" || ext === "cbr") return "CBX";
  return ext.toUpperCase();
}

/** 扫描书库目录并 upsert 到 Book 表，返回按文件名排序的记录 */
export async function syncBooks() {
  let names: string[] = [];
  try {
    names = await readdir(BOOKS_DIR);
  } catch {
    return [];
  }

  const files = names.filter((n) => SUPPORTED.has(extOf(n)) && !n.startsWith("."));
  const out = [];

  for (const fileName of files) {
    const full = path.join(BOOKS_DIR, fileName);
    const info = await stat(full);
    if (!info.isFile()) continue;
    const ext = extOf(fileName);
    const title = fileName.replace(/\.[^.]+$/, "");

    const row = await prisma.book.upsert({
      where: { fileName },
      update: { fileSize: BigInt(info.size) },
      create: {
        userId: SYNC_USER_ID,
        fileName,
        title,
        format: ext,
        fileSize: BigInt(info.size),
      },
    });
    out.push(row);
  }

  return out.sort((a, b) => a.title.localeCompare(b.title, "zh"));
}

/* ---------------------------------------------------------------- 部分 MD5 区间 */

/** 与 Readest / KOReader 一致的 12 段 1KB 区间 */
export function partialMD5Ranges(fileSize: number): Array<[number, number]> {
  const step = 1024;
  const size = 1024;
  const ranges: Array<[number, number]> = [];
  // 与 Readest 的 `step << (2 * i)` 对齐：i=-1 时 JS 位移溢出为 0，即从文件头开始
  for (let i = -1; i <= 10; i++) {
    const offset = i === -1 ? 0 : step * Math.pow(4, i);
    const start = Math.min(fileSize, offset);
    const end = Math.min(start + size, fileSize);
    if (start >= fileSize) break;
    ranges.push([start, end]);
  }
  return ranges;
}
