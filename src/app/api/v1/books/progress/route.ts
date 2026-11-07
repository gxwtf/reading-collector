import { unauthorized, verifyToken } from "@/lib/readest";
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

  const page = body.pdfProgress ?? body.cbxProgress;
  await prisma.book.update({
    where: { id: body.bookId },
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
