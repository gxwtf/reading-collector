import { unauthorized, verifyToken } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  if (!verifyToken(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { bookId?: number; readStatus?: string };
  if (!body.bookId || !body.readStatus) {
    return Response.json({ error: "bookId/readStatus 必填" }, { status: 400 });
  }
  await prisma.book.update({ where: { id: body.bookId }, data: { readStatus: body.readStatus } });
  return new Response(null, { status: 204 });
}
