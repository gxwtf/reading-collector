import { fmt, unauthorized, verifyToken } from "@/lib/readest";
import { prisma } from "@/lib/db";

function shape(a: {
  id: number;
  bookId: number;
  cfi: string;
  text: string;
  color: string | null;
  style: string | null;
  note: string | null;
  chapterTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: a.id,
    bookId: a.bookId,
    cfi: a.cfi,
    text: a.text,
    color: a.color,
    style: a.style,
    note: a.note,
    chapterTitle: a.chapterTitle,
    createdAt: fmt(a.createdAt),
    updatedAt: fmt(a.updatedAt),
  };
}

export async function POST(req: Request) {
  if (!verifyToken(req)) return unauthorized();
  const body = (await req.json().catch(() => null)) as {
    bookId?: number;
    cfi?: string;
    text?: string;
    color?: string;
    style?: string;
    note?: string;
    chapterTitle?: string;
  } | null;
  if (!body?.bookId || !body.cfi || !body.text) {
    return Response.json({ error: "bookId/cfi/text 必填" }, { status: 400 });
  }

  const row = await prisma.bookAnnotation.upsert({
    where: { bookId_cfi_text: { bookId: body.bookId, cfi: body.cfi, text: body.text } },
    update: {
      color: body.color ?? null,
      style: body.style ?? null,
      note: body.note ?? null,
      chapterTitle: body.chapterTitle ?? null,
    },
    create: {
      bookId: body.bookId,
      cfi: body.cfi,
      text: body.text,
      color: body.color ?? null,
      style: body.style ?? null,
      note: body.note ?? null,
      chapterTitle: body.chapterTitle ?? null,
    },
  });

  return Response.json(shape(row));
}
