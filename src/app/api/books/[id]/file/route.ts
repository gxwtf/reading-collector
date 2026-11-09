import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";

import { booksRoot } from "@/lib/readest";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.userId) return new Response("未登录", { status: 401 });

  const { id } = await ctx.params;
  const book = await prisma.book.findFirst({ where: { id: Number(id), userId: session.userId } });
  if (!book) return new Response("not found", { status: 404 });

  const full = path.join(booksRoot(book.userId), book.fileName);
  let size = 0;
  try {
    size = (await stat(full)).size;
  } catch {
    return new Response("file missing", { status: 404 });
  }

  const name = `${book.title}.${book.format}`;
  return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
