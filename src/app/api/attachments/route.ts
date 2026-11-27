// 上传图片附件：POST /api/attachments
// 支持两种用法：
//   1. 编辑器里插图：返 { id, url }，前端把 url 插进 Markdown
//   2. 独立成条：带 entryId 时直接挂到该条目
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { saveImage } from "@/lib/attachments";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "没有收到文件" }, { status: 400 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: "没有收到文件" }, { status: 400 });

  // entryId 可选：有就要校验归属，绝不能挂到别人的条目上
  const rawEntry = form.get("entryId");
  let entryId: number | null = null;
  if (rawEntry) {
    const candidate = Number(rawEntry);
    if (Number.isInteger(candidate)) {
      const owned = await prisma.entry.findFirst({
        where: { id: candidate, userId: session.userId },
        select: { id: true },
      });
      if (!owned) return Response.json({ error: "条目不存在" }, { status: 404 });
      entryId = owned.id;
    }
  }

  const saved: { id: number; url: string; width: number | null; height: number | null }[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const result = await saveImage(session.userId, file, entryId);
      if (result.ok) saved.push(result.attachment);
      else errors.push(`${file.name}：${result.error}`);
    } catch (error) {
      console.error("保存附件失败", error);
      errors.push(`${file.name}：服务端保存失败`);
    }
  }

  if (saved.length === 0) {
    return Response.json({ error: errors[0] ?? "上传失败" }, { status: 400 });
  }

  return Response.json({ ok: true, attachments: saved, added: saved.length, errors });
}
