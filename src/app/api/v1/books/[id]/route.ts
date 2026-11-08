import { bookType, extOf, fmt, tokenUserId, unauthorized, verifyToken, SYNC_USER_ID } from "@/lib/readest";
import { prisma } from "@/lib/db";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyToken(req)) return unauthorized();
  const { id } = await ctx.params;
  const b = await prisma.book.findFirst({
    where: { id: Number(id), userId: tokenUserId(req) ?? SYNC_USER_ID },
  });
  if (!b) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({
    id: b.id,
    title: b.title,
    metadata: { title: b.title, authors: b.author ? [b.author] : [] },
    primaryFile: {
      id: b.id,
      bookId: b.id,
      fileName: b.fileName,
      fileSizeKb: Math.floor(Number(b.fileSize) / 1024),
      bookType: bookType(extOf(b.fileName)),
      extension: extOf(b.fileName),
    },
    alternativeFormats: [],
    epubProgress: b.epubPercent ? { cfi: b.epubCfi, href: b.epubHref, percentage: b.epubPercent } : null,
    pdfProgress: b.pdfPercent ? { page: b.pdfPage, percentage: b.pdfPercent } : null,
    readStatus: b.readStatus,
    lastReadTime: fmt(b.lastReadTime),
  });
}
