import { fmt, unauthorized, verifyToken } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyToken(req)) return unauthorized();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    color?: string;
    style?: string;
    note?: string;
  };
  const row = await prisma.bookAnnotation.update({
    where: { id: Number(id) },
    data: {
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.style !== undefined ? { style: body.style } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
    },
  });
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
  await prisma.bookAnnotation.delete({ where: { id: Number(id) } });
  return new Response(null, { status: 204 });
}
