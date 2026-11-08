import { tokenUserId, unauthorized, verifyToken, SYNC_USER_ID } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  if (!verifyToken(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { bookId?: number; readStatus?: string };
  if (!body.bookId || !body.readStatus) {
    return Response.json({ error: "bookId/readStatus 必填" }, { status: 400 });
  }
  const uid = tokenUserId(req) ?? SYNC_USER_ID;
  const book = await prisma.book.findFirst({ where: { id: body.bookId, userId: uid } });
  if (!book) return Response.json({ error: "not found" }, { status: 404 });

  await prisma.book.update({ where: { id: book.id }, data: { readStatus: body.readStatus } });
  return new Response(null, { status: 204 });
}
