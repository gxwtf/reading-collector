import { fmt, tokenUserId, unauthorized, verifyToken, SYNC_USER_ID } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function GET(req: Request, ctx: { params: Promise<{ bookId: string }> }) {
  if (!verifyToken(req)) return unauthorized();
  const { bookId } = await ctx.params;
  const uid = tokenUserId(req) ?? SYNC_USER_ID;
  const book = await prisma.book.findFirst({ where: { id: Number(bookId), userId: uid } });
  if (!book) return Response.json({ error: "not found" }, { status: 404 });

  const rows = await prisma.bookBookmark.findMany({
    where: { bookId: book.id },
    orderBy: { id: "asc" },
  });
  return Response.json(
    rows.map((b) => ({
      id: b.id,
      bookId: b.bookId,
      cfi: b.cfi,
      pageNumber: b.pageNumber,
      title: b.title,
      notes: b.notes,
      createdAt: fmt(b.createdAt),
      updatedAt: fmt(b.updatedAt),
    })),
  );
}
