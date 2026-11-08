import { tokenUserId, unauthorized, verifyToken, SYNC_USER_ID } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  if (!verifyToken(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as {
    bookId?: number;
    epubProgress?: { cfi?: string; href?: string; percentage?: number };
    pdfProgress?: { page?: number; percentage?: number };
    cbxProgress?: { page?: number; percentage?: number };
  };
  if (!body.bookId) return Response.json({ error: "bookId 必填" }, { status: 400 });

  const uid = tokenUserId(req) ?? SYNC_USER_ID;
  const book = await prisma.book.findFirst({ where: { id: body.bookId, userId: uid } });
  if (!book) return Response.json({ error: "not found" }, { status: 404 });

  const page = body.pdfProgress ?? body.cbxProgress;
  await prisma.book.update({
    where: { id: book.id },
    data: {
      ...(body.epubProgress
        ? {
            epubCfi: body.epubProgress.cfi ?? null,
            epubHref: body.epubProgress.href ?? null,
            epubPercent: body.epubProgress.percentage ?? null,
          }
        : {}),
      ...(page ? { pdfPage: page.page ?? null, pdfPercent: page.percentage ?? null } : {}),
      lastReadTime: new Date(),
    },
  });
  return new Response(null, { status: 204 });
}
