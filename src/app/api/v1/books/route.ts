import { bookType, extOf, fmt, syncBooks, unauthorized, verifyToken } from "@/lib/readest";

export async function GET(req: Request) {
  if (!verifyToken(req)) return unauthorized();

  const books = await syncBooks();
  return Response.json(
    books.map((b) => ({
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
      epubProgress: b.epubPercent
        ? { cfi: b.epubCfi, href: b.epubHref, percentage: b.epubPercent }
        : null,
      pdfProgress: b.pdfPercent ? { page: b.pdfPage, percentage: b.pdfPercent } : null,
      readStatus: b.readStatus,
      lastReadTime: fmt(b.lastReadTime),
    })),
  );
}
