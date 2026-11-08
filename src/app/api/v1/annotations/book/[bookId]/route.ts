import { fmt, tokenUserId, unauthorized, verifyToken, SYNC_USER_ID } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function GET(req: Request, ctx: { params: Promise<{ bookId: string }> }) {
  if (!verifyToken(req)) return unauthorized();
  const { bookId } = await ctx.params;
  const rows = await prisma.bookAnnotation.findMany({
    where: { bookId: Number(bookId), userId: tokenUserId(req) ?? SYNC_USER_ID },
    orderBy: { id: "asc" },
  });
  return Response.json(
    rows.map((a) => ({
      id: a.id,
      bookId: a.bookId,
      cfi: a.cfi,
      text: a.text,
      color: a.color,
      style: a.style,
      note: a.note,
      chapterTitle: a.chapterTitle,
      createdAt: fmt(a.createdAt),
      updatedAt: fmt(a.updatedAt),
    })),
  );
}
