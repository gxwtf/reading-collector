import { fmt, tokenUserId, unauthorized, verifyToken, SYNC_USER_ID } from "@/lib/readest";
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
  const uid = tokenUserId(req) ?? SYNC_USER_ID;
  const book = await prisma.book.findFirst({ where: { id: body.bookId, userId: uid } });
  if (!book) return Response.json({ error: "not found" }, { status: 404 });

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
