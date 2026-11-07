import { fmt, unauthorized, verifyToken } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  if (!verifyToken(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as {
    bookId?: number;
    cfi?: string;
    title?: string;
  };
  if (!body.bookId || !body.cfi) {
    return Response.json({ error: "bookId/cfi 必填" }, { status: 400 });
  }
  const row = await prisma.bookBookmark.create({
    data: { bookId: body.bookId, cfi: body.cfi, title: body.title ?? null },
  });
  return Response.json({
    id: row.id,
    bookId: row.bookId,
    cfi: row.cfi,
    pageNumber: row.pageNumber,
    title: row.title,
    notes: row.notes,
    createdAt: fmt(row.createdAt),
    updatedAt: fmt(row.updatedAt),
  });
}
