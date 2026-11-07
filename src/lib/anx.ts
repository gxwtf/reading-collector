import path from "node:path";

import { prisma } from "@/lib/db";

// 不要从 "@/lib/readest" 取常量：那边会在 syncBooks 里 import 本文件，形成循环依赖
const BOOKS_DIR = process.env.READEST_BOOKS_DIR || "/home/gxwtf/reading-books";

type AnxBook = {
  id: number;
  title?: string | null;
  author?: string | null;
  file_path?: string | null;
  reading_percentage?: number | null;
};

type AnxNote = {
  id: number;
  book_id: number;
  content?: string | null;
  cfi?: string | null;
  chapter?: string | null;
  color?: string | null;
  reader_note?: string | null;
};

const ANX_DB = path.join(BOOKS_DIR, "anx", "database7.db");

/**
 * Anx Reader 通过 WebDAV 同步上来的是 SQLite 库 + data/file 下的书。
 * 这里直接读它的库（只读打开），拿真实书名、作者、进度和划线。
 * 读不到就静默跳过——Anx 只是可选的客户端之一。
 */
export async function syncAnx(): Promise<number> {
  let db: import("node:sqlite").DatabaseSync | null = null;

  try {
    const { DatabaseSync } = await import("node:sqlite");
    db = new DatabaseSync(ANX_DB, { readOnly: true });
  } catch {
    return 0;
  }

  let imported = 0;

  try {
    const books = db.prepare(
      `SELECT id, title, author, file_path, reading_percentage FROM tb_books WHERE COALESCE(is_deleted, 0) = 0`,
    ).all() as unknown as AnxBook[];

    const byRel = new Map<string, number>(); // 相对 BOOKS_DIR 的路径 → Book.id

    for (const b of books) {
      if (!b.file_path) continue;
      // Anx 里存的是 "file/xxx.epub"，实际落在 BOOKS_DIR/anx/data/file/
      const rel = b.file_path.replace(/^\/+/, "");
      const fileName = rel.startsWith("anx/") ? rel : path.join("anx", "data", rel);

      const existing = await prisma.book.findUnique({ where: { fileName } });
      if (!existing) continue;

      // Anx 存的是 0~1 的小数，页面按百分比显示
      const pct = b.reading_percentage;
      const percent = pct == null ? existing.epubPercent : pct <= 1 ? pct * 100 : pct;
      const author = b.author?.trim();
      const row = await prisma.book.update({
        where: { id: existing.id },
        data: {
          title: b.title?.trim() || existing.title,
          author: author ? (author === "Unknown" ? null : author) : existing.author,
          epubPercent: percent,
        },
      });
      byRel.set(rel, row.id);
    }

    const notes = db.prepare(
      `SELECT id, book_id, content, cfi, chapter, color, reader_note FROM tb_notes`,
    ).all() as unknown as AnxNote[];

    const idMap = new Map<number, number>(); // Anx book_id → Book.id
    for (const b of books) {
      if (!b.file_path) continue;
      const rel = b.file_path.replace(/^\/+/, "");
      const bookId = byRel.get(rel);
      if (bookId) idMap.set(b.id, bookId);
    }

    for (const n of notes) {
      const bookId = idMap.get(n.book_id);
      if (!bookId || !n.content) continue;
      const cfi = n.cfi || `anx:${n.id}`;
      await prisma.bookAnnotation.upsert({
        where: { bookId_cfi_text: { bookId, cfi, text: n.content } },
        update: { note: n.reader_note ?? null, chapterTitle: n.chapter ?? null, color: n.color ?? null },
        create: {
          bookId,
          cfi,
          text: n.content,
          note: n.reader_note ?? null,
          chapterTitle: n.chapter ?? null,
          color: n.color ?? null,
          style: "highlight",
        },
      });
      imported += 1;
    }
  } catch {
    /* 库被占用或结构变化，跳过 */
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }

  return imported;
}
