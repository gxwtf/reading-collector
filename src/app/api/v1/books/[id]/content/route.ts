import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { stat } from "node:fs/promises";
import path from "node:path";

import { booksRoot, tokenUserId, unauthorized, verifyToken, SYNC_USER_ID } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyToken(req)) return unauthorized();

  const { id } = await ctx.params;
  const book = await prisma.book.findFirst({
    where: { id: Number(id), userId: tokenUserId(req) ?? SYNC_USER_ID },
  });
  if (!book) return Response.json({ error: "not found" }, { status: 404 });

  const full = path.join(booksRoot(book.userId), book.fileName);
  let size = 0;
  try {
    size = (await stat(full)).size;
  } catch {
    return Response.json({ error: "file missing" }, { status: 404 });
  }

  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      let end = m[2] ? Number(m[2]) : size - 1;
      if (end >= size) end = size - 1;
      if (start > end) return new Response(null, { status: 416 });

      const stream = Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream;
      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }
  }

  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
    },
  });
}
