// 导入本地 PDF：存原文件 + 抽文字入库。
//
// 与「贴 arxiv 链接」那条路的区别：那条走 worker（异步抓取），这条在请求里
// 直接完成——文件已经在手里，没必要再排一次队。代价是请求耗时（50MB 的
// PDF 抽文字可能要十几秒），所以上限卡在 50MB、页数卡在 300。
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  MAX_PDF_BYTES,
  escapeMdxAngles,
  extractPdfText,
  isPdf,
  savePdfFile,
  titleFromFilename,
} from "@/lib/pdf";

export const dynamic = "force-dynamic";

/** 分组归属必须服务端校验，不能信前端传的 id */
async function ownedCollection(raw: unknown, userId: number): Promise<number | null> {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const found = await prisma.collection.findFirst({ where: { id, userId }, select: { id: true } });
  return found?.id ?? null;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "没有收到文件" }, { status: 400 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: "没有收到文件" }, { status: 400 });

  const collectionId = await ownedCollection(form.get("collectionId"), session.userId);

  let added = 0;
  const skipped: string[] = [];
  const notes: string[] = [];

  for (const file of files) {
    if (file.size > MAX_PDF_BYTES) {
      skipped.push(`${file.name}：超过 ${MAX_PDF_BYTES / 1024 / 1024}MB`);
      continue;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPdf(bytes)) {
      skipped.push(`${file.name}：不是 PDF 文件`);
      continue;
    }

    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    const url = `pdf:${hash}`;

    const existing = await prisma.entry.findFirst({
      where: { userId: session.userId, urlHash: hash },
      select: { id: true },
    });
    if (existing) {
      if (collectionId) {
        await prisma.collectionEntry.upsert({
          where: { collectionId_entryId: { collectionId, entryId: existing.id } },
          update: {},
          create: { collectionId, entryId: existing.id },
        });
      }
      skipped.push(`${file.name}：已经导入过`);
      continue;
    }

    // 原文件必须先落盘：抽文字失败也要能原样查看
    let pdfPath: string;
    try {
      pdfPath = await savePdfFile(bytes);
    } catch (error) {
      console.error("[pdf] 落盘失败", error);
      skipped.push(`${file.name}：服务端保存失败`);
      continue;
    }

    const extracted = await extractPdfText(bytes);
    console.log("[pdf] 抽取结果", file.name, extracted.ok ? `ok ${extracted.pages}p` : extracted.error);
    const title = titleFromFilename(file.name);

    const body = extracted.ok
      ? `# ${escapeMdxAngles(title)}\n\n${escapeMdxAngles(extracted.text)}`
      : `# ${escapeMdxAngles(title)}\n\n> 这个 PDF 里抽不出文字（可能是扫描件）。用上方的原文查看器直接读。`;
    const plain = extracted.ok ? extracted.text.replace(/\s+/g, "") : "";

    const created = await prisma.entry.create({
      data: {
        userId: session.userId,
        url,
        urlHash: hash,
        title,
        site: "PDF",
        kind: "document",
        state: "ready",
        contentMd: body,
        excerpt: extracted.ok ? extracted.text.slice(0, 160) : `${title}（扫描件，需看原文）`,
        wordCount: plain.length || null,
        pdfPath,
      },
      select: { id: true },
    });

    if (collectionId) {
      await prisma.collectionEntry.upsert({
        where: { collectionId_entryId: { collectionId, entryId: created.id } },
        update: {},
        create: { collectionId, entryId: created.id },
      });
    }

    added += 1;
    notes.push(
      extracted.ok
        ? `${file.name}：${extracted.pages} 页，${plain.length} 字`
        : `${file.name}：已存原文件，但抽不出文字`,
    );
  }

  return Response.json({ ok: true, added, skipped: skipped.length, notes, errors: skipped });
}
