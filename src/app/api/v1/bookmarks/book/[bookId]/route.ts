import { fmt, unauthorized, verifyToken } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function GET(req: Request, ctx: { params: Promise<{ bookId: string }> }) {
  if (!verifyToken(req)) return unauthorized();
  const { bookId } = await ctx.params;
  const rows = await prisma.bookBookmark.findMany({
    where: { bookId: Number(bookId) },
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
