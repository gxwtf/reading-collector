import { fmt, tokenUserId, unauthorized, verifyToken, SYNC_USER_ID } from "@/lib/readest";
import { prisma } from "@/lib/db";

/** 校验书签归属：书签所属的书必须属于当前用户 */
async function ownedBookmark(id: number, userId: number) {
  const row = await prisma.bookBookmark.findFirst({ where: { id } });
  if (!row) return null;
  const book = await prisma.book.findFirst({ where: { id: row.bookId, userId } });
  return book ? row : null;
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyToken(req)) return unauthorized();
  const { id } = await ctx.params;
  const userId = tokenUserId(req) ?? SYNC_USER_ID;
  const owned = await ownedBookmark(Number(id), userId);
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { title?: string; notes?: string };
  const row = await prisma.bookBookmark.update({
    where: { id: owned.id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
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

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyToken(req)) return unauthorized();
  const { id } = await ctx.params;
  const userId = tokenUserId(req) ?? SYNC_USER_ID;
  const owned = await ownedBookmark(Number(id), userId);
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  await prisma.bookBookmark.delete({ where: { id: owned.id } });
  return new Response(null, { status: 204 });
}
