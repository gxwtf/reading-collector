// 导入 Markdown（文件或粘贴文本）：直接入库，不走抓取
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { summarizeMarkdown } from "@/lib/summarize";

export const dynamic = "force-dynamic";

/**
 * 校验 collectionId 属于当前用户。
 * 绝不信任前端传来的分组 id——别人的 collectionId 会把条目挂进别人的分组视图里。
 */
async function ownedCollection(raw: unknown, userId: number): Promise<number | null> {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const found = await prisma.collection.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  return found?.id ?? null;
}

function titleOf(markdown: string, fallback: string) {
  const heading = markdown.match(/^\s*#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 200);
  const firstLine = markdown.split("\n").find((l) => l.trim())?.trim() ?? "";
  return (firstLine || fallback).slice(0, 200);
}

async function save(userId: number, name: string, markdown: string, collectionId: number | null) {
  const body = markdown.trim();
  if (body.length < 20) return false;

  const title = titleOf(body, name.replace(/\.(md|markdown|txt)$/i, ""));
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 32);
  const url = `markdown:${hash}`;

  const existing = await prisma.entry.findFirst({
    where: { userId, urlHash: hash },
    select: { id: true },
  });
  if (existing) {
    // 重复内容不新建条目，但仍要放进分组，否则「拖进分组」看起来没反应
    if (collectionId) {
      await prisma.collectionEntry.upsert({
        where: { collectionId_entryId: { collectionId, entryId: existing.id } },
        update: {},
        create: { collectionId, entryId: existing.id },
      });
    }
    return false;
  }

  const plain = body.replace(/[#>*`[\]()!-]/g, "");

  const created = await prisma.entry.create({
    data: {
      userId,
      url,
      urlHash: hash,
      title,
      site: "Markdown",
      kind: "article",
      state: "ready",
      contentMd: body,
      summary: summarizeMarkdown(body),
      excerpt: plain.replace(/\s+/g, " ").slice(0, 160),
      wordCount: plain.replace(/\s+/g, "").length,
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
  return true;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  // 粘贴文本
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      markdown?: string;
      title?: string;
      collectionId?: unknown;
    } | null;
    const text = body?.markdown ?? "";
    if (!text.trim()) return Response.json({ error: "内容为空" }, { status: 400 });
    const collectionId = await ownedCollection(body?.collectionId, session.userId);
    const ok = await save(session.userId, body?.title ?? "markdown", text, collectionId);
    return Response.json({ ok, added: ok ? 1 : 0, skipped: ok ? 0 : 1 });
  }

  // 上传文件（可多选）
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "没有收到文件" }, { status: 400 });

  const collectionId = await ownedCollection(form.get("collectionId"), session.userId);
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  let added = 0;
  for (const file of files) {
    const text = await file.text();
    if (await save(session.userId, file.name, text, collectionId)) added += 1;
  }

  return Response.json({ ok: true, added, skipped: files.length - added, count: files.length });
}
