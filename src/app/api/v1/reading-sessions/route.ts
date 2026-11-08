import { tokenUserId, unauthorized, verifyToken, SYNC_USER_ID } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  if (!verifyToken(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as {
    bookId?: number;
    startTime?: string;
    endTime?: string;
    durationSeconds?: number;
    startProgress?: number;
    endProgress?: number;
  };
  if (!body.bookId || !body.startTime || !body.endTime) {
    return Response.json({ error: "bookId/startTime/endTime 必填" }, { status: 400 });
  }
  const uid = tokenUserId(req) ?? SYNC_USER_ID;
  const book = await prisma.book.findFirst({ where: { id: body.bookId, userId: uid } });
  if (!book) return Response.json({ error: "not found" }, { status: 404 });

  const row = await prisma.readingSession.create({
    data: {
      bookId: body.bookId,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      durationSeconds: body.durationSeconds ?? 0,
      startProgress: body.startProgress ?? null,
      endProgress: body.endProgress ?? null,
    },
  });
  return Response.json({ id: row.id });
}
