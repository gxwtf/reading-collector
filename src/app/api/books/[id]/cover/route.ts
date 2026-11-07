import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";

import { BOOKS_DIR } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const book = await prisma.book.findUnique({ where: { id: Number(id) } });
  if (!book?.coverFile) return new Response("no cover", { status: 404 });

  const full = path.join(BOOKS_DIR, "covers", book.coverFile);
  const info = await stat(full).catch(() => null);
  if (!info) return new Response("no cover", { status: 404 });

  return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
