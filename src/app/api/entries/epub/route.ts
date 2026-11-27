// 导入 epub：jszip 解包 + turndown 转 Markdown，直接入库，不走抓取
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { saveTextEntry } from "@/lib/entry-import";
import { parseEpub } from "@/lib/epub";

export const dynamic = "force-dynamic";

/** 单文件上限 30MB */
const MAX_SIZE = 30 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "没有收到文件" }, { status: 400 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: "没有收到文件" }, { status: 400 });

  // 分组归属必须服务端校验，不能信前端传的 id
  const rawCollection = Number(form.get("collectionId"));
  const collectionId = Number.isInteger(rawCollection) && rawCollection > 0
    ? (await prisma.collection.findFirst({ where: { id: rawCollection, userId: session.userId }, select: { id: true } }))?.id ?? null
    : null;

  let added = 0;
  let skipped = 0;
  for (const file of files) {
    if (file.size > MAX_SIZE) {
      return Response.json({ error: "文件太大" }, { status: 400 });
    }
    try {
      const buf = await file.arrayBuffer();
      const { title, author, markdown } = await parseEpub(buf);
      const ok = await saveTextEntry(session.userId, markdown, {
        title,
        fallbackTitle: file.name.replace(/\.epub$/i, ""),
        site: "EPUB",
        urlPrefix: "epub",
        author,
        collectionId,
      });
      if (ok) added += 1;
      else skipped += 1;
    } catch {
      // 单本解析失败跳过，不影响其它文件
      skipped += 1;
    }
  }

  return Response.json({ ok: true, added, skipped, count: files.length });
}
