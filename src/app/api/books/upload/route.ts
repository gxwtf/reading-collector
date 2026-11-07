import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { BOOKS_DIR, extOf, SYNC_USER_ID } from "@/lib/readest";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

const ALLOWED = new Set(["epub", "pdf", "cbz", "cbr", "mobi", "azw3", "fb2", "txt"]);
const MAX_BYTES = 300 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) return Response.json({ error: "未登录" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "没有文件" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "文件超过 300MB" }, { status: 413 });

  const ext = extOf(file.name);
  if (!ALLOWED.has(ext)) return Response.json({ error: `不支持的格式 .${ext}` }, { status: 415 });

  // 只保留文件名主体，去掉路径与危险字符
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[/\\:*?"<>|]/g, "_").slice(0, 120);
  const fileName = `${base}.${ext}`;

  await mkdir(BOOKS_DIR, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(BOOKS_DIR, fileName), buf);

  const row = await prisma.book.upsert({
    where: { fileName },
    update: { fileSize: BigInt(buf.length) },
    create: {
      userId: SYNC_USER_ID,
      fileName,
      title: base,
      format: ext,
      fileSize: BigInt(buf.length),
    },
  });

  return Response.json({ id: row.id, title: row.title, size: buf.length });
}
