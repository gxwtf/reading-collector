import { createHmac, timingSafeEqual } from "node:crypto";
import { link, mkdir, readFile, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import { syncAnx } from "@/lib/anx";

const SUPPORTED = new Set(["epub", "pdf", "cbz", "cbr", "mobi", "azw3", "fb2", "txt"]);

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

/** 从 token 里取 userId（不校验签名，签名由 verifyToken 负责） */
export function tokenUserId(req: Request): number | null {
  const raw = req.headers.get("authorization") || "";
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token.includes(".")) return null;
  const [payload] = token.split(".");
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { userId?: number; exp?: number };
    if (typeof data.exp === "number" && data.exp <= Date.now()) return null;
    return typeof data.userId === "number" ? data.userId : null;
  } catch {
    return null;
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

/* ---------------------------------------------------------------- 书库扫描 */

type LibBook = {
  hash?: string;
  title?: string;
  sourceTitle?: string;
  author?: string;
  format?: string;
};

/** Readest 通过 WebDAV 同步时会写 library.json，里面有真正的书名与作者 */
async function readLibraryMeta(): Promise<Map<string, LibBook>> {
  const map = new Map<string, LibBook>();
  const candidates = [
    path.join(BOOKS_DIR, "Readest", "library.json"),
    path.join(BOOKS_DIR, "library.json"),
  ];
  for (const file of candidates) {
    try {
      const raw = JSON.parse(await readFile(file, "utf8")) as { books?: LibBook[] };
      for (const b of raw.books ?? []) if (b.hash) map.set(b.hash, b);
    } catch {
      /* 没有就是没有 */
    }
  }
  return map;
}

/** 递归列出书库里的书（Readest 会放在 Readest/books/<hash>/xxx.epub） */
async function mirrorInodeSet(): Promise<Set<bigint | number>> {
  const mirror = path.join(BOOKS_DIR, "_library");
  const set = new Set<bigint | number>();
  try {
    for (const name of await readdir(mirror)) {
      const info = await stat(path.join(mirror, name)).catch(() => null);
      if (info) set.add(info.ino);
    }
  } catch {
    /* 没有镜像目录 */
  }
  return set;
}

async function walkBooks(dir: string, depth = 0, mirrorInodes: Set<bigint | number> = new Set()): Promise<string[]> {
  if (depth > 4) return [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const e of entries) {
    // 跳过隐藏文件，以及给 Readest 准备的下划线镜像（_library/_书名.epub）
    if (e.name.startsWith(".") || e.name.startsWith("_")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Readest 目录是发布镜像，covers 是封面，都不当书扫
      if (e.name === "Readest" || e.name === "covers") continue;
      out.push(...(await walkBooks(full, depth + 1, mirrorInodes)));
    } else if (SUPPORTED.has(extOf(e.name))) {
      out.push(full);
    }
  }
  return out;
}

/** 扫书库并 upsert 到 Book 表，返回按书名排序的记录 */
export async function syncBooks(userId: number = SYNC_USER_ID) {
  const walked = await walkBooks(BOOKS_DIR);

  // 同一本书可能以硬链接形式出现在多个目录（original/、Readest/books/<hash>/、anx/…），
  // 按 inode 去重，保留路径最短的那份
  const seen = new Map<string, string>();
  for (const f of walked) {
    const info = await stat(f).catch(() => null);
    if (!info) continue;
    const key = `${info.dev}:${info.ino}`;
    const rel = path.relative(BOOKS_DIR, f);
    const prev = seen.get(key);
    if (!prev || rel.length < prev.length) seen.set(key, rel);
  }
  const files = [...seen.values()].map((rel) => path.join(BOOKS_DIR, rel));

  const meta = await readLibraryMeta();
  const rows = [];

  for (const full of files) {
    const info = await stat(full);
    if (!info.isFile()) continue;

    const rel = path.relative(BOOKS_DIR, full);
    const ext = extOf(rel);
    const hash = path.basename(path.dirname(full));
    const lib = meta.get(hash);
    const fallback = path.basename(rel).replace(/\.[^.]+$/, "");

    const row = await prisma.book.upsert({
      where: { fileName: rel },
      update: { fileSize: BigInt(info.size) },
      create: {
        userId,
        fileName: rel,
        title: lib?.title || lib?.sourceTitle || fallback,
        author: lib?.author ?? null,
        format: ext,
        fileSize: BigInt(info.size),
      },
    });
    rows.push(row);
  }

  // 清掉磁盘上已经不存在的记录（重命名/移动后不留幽灵条目）
  await prisma.book
    .deleteMany({ where: { userId, fileName: { notIn: files.map((f) => path.relative(BOOKS_DIR, f)) } } })
    .catch(() => null);

  // 书先入库，再用 Anx 的 SQLite 覆盖真实书名/作者并导入划线
  await syncAnx(userId).catch(() => 0);

  const refreshed = await prisma.book.findMany({
    where: { userId, fileName: { in: files.map((f) => path.relative(BOOKS_DIR, f)) } },
  });
  return refreshed.sort((a, b) => a.title.localeCompare(b.title, "zh"));
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
