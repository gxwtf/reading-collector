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
      out.push(...(await walkBooks(full, depth + 1, mirrorInodes)));
    } else if (SUPPORTED.has(extOf(e.name))) {
      out.push(full);
    }
  }
  return out;
}

/** 扫书库并 upsert 到 Book 表，返回按书名排序的记录 */
export async function syncBooks() {
  const [files, meta] = await Promise.all([walkBooks(BOOKS_DIR), readLibraryMeta()]);
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
        userId: SYNC_USER_ID,
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
    .deleteMany({ where: { fileName: { notIn: files.map((f) => path.relative(BOOKS_DIR, f)) } } })
    .catch(() => null);

  // 书先入库，再用 Anx 的 SQLite 覆盖真实书名/作者并导入划线
  await syncAnx().catch(() => 0);
  await publishLibrary().catch(() => 0);

  const refreshed = await prisma.book.findMany({ where: { fileName: { in: files.map((f) => path.relative(BOOKS_DIR, f)) } } });
  return refreshed.sort((a, b) => a.title.localeCompare(b.title, "zh"));
}

/* ---------------------------------------------------------------- 扁平镜像 */

/**
 * Readest / Anx 的书分散在各自目录里（Readest/books/<hash>/、anx/data/file/），
 * 手机上一个个翻太麻烦。这里把所有书硬链接到 _library/<书名>.<格式>，
 * 一个文件夹就是全部书，WebDAV 里点进去直接下载。
 */
export async function publishLibrary() {
  const mirror = path.join(BOOKS_DIR, "_library");
  await mkdir(mirror, { recursive: true }).catch(() => null);

  const books = await prisma.book.findMany();
  for (const b of books) {
    const src = path.join(BOOKS_DIR, b.fileName);
    const safe = b.title.replace(/[/\\:*?"<>|]/g, "_").slice(0, 80) || `book-${b.id}`;
    const dst = path.join(mirror, `${safe}.${b.format}`);

    try {
      const [a, c] = await Promise.all([stat(src), stat(dst).catch(() => null)]);
      if (c && c.size === a.size) continue; // 已经有了
      if (c) await unlink(dst).catch(() => null);
      await link(src, dst);
    } catch {
      /* 跨设备或权限问题就跳过 */
    }
  }
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
