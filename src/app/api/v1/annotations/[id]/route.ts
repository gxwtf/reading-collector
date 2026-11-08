import { fmt, tokenUserId, unauthorized, verifyToken, SYNC_USER_ID } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyToken(req)) return unauthorized();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    color?: string | null;
    style?: string | null;
    note?: string | null;
  };

  // Readest 约定：字段为 null 表示「不修改」，空字符串表示「清空」
  const data: { color?: string; style?: string; note?: string | null } = {};
  if (body.color != null) data.color = body.color;
  if (body.style != null) data.style = body.style;
  if (body.note !== undefined && body.note !== null) {
    data.note = body.note === "" ? null : body.note;
  }

  const userId = tokenUserId(req) ?? SYNC_USER_ID;
  const { count } = await prisma.bookAnnotation.updateMany({
    where: { id: Number(id), userId },
    data,
  });
  if (count === 0) return Response.json({ error: "not found" }, { status: 404 });

  const row = await prisma.bookAnnotation.findFirst({ where: { id: Number(id), userId } });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  return Response.json({
    id: row.id,
    bookId: row.bookId,
    cfi: row.cfi,
    text: row.text,
    color: row.color,
    style: row.style,
    note: row.note,
    chapterTitle: row.chapterTitle,
    createdAt: fmt(row.createdAt),
    updatedAt: fmt(row.updatedAt),
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyToken(req)) return unauthorized();
  const { id } = await ctx.params;
  const { count } = await prisma.bookAnnotation.deleteMany({
    where: { id: Number(id), userId: tokenUserId(req) ?? SYNC_USER_ID },
  });
  if (count === 0) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
