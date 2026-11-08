import { tokenUserId, unauthorized, verifyToken, SYNC_USER_ID } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function GET(req: Request, ctx: { params: Promise<{ bookId: string }> }) {
  if (!verifyToken(req)) return unauthorized();
  const { bookId } = await ctx.params;
  const uid = tokenUserId(req) ?? SYNC_USER_ID;
  const book = await prisma.book.findFirst({ where: { id: Number(bookId), userId: uid } });
  if (!book) return Response.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const size = Math.min(Number(url.searchParams.get("size") ?? 100), 500);
  const page = Math.max(Number(url.searchParams.get("page") ?? 0), 0);
  const rows = await prisma.readingSession.findMany({
    where: { bookId: book.id },
    orderBy: { startTime: "desc" },
    skip: page * size,
    take: size,
  });
  return Response.json(
    rows.map((s) => ({
      id: s.id,
      bookId: s.bookId,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      durationSeconds: s.durationSeconds,
      startProgress: s.startProgress,
      endProgress: s.endProgress,
    })),
  );
}
