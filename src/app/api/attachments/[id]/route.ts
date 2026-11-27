// 读取图片附件：GET /api/attachments/<id>[?share=<token>]
//
// 两个入口共用同一个路由：
//   - 登录用户按 userId 校验归属
//   - 分享页没有登录态，改用条目的 shareToken 放行（只读、且必须确实是该条目下的附件）
//
// 借鉴 memos fileserver 的几条硬规矩：
//   - 先查元数据、鉴权通过才读文件（未授权请求不会把磁盘翻一遍）
//   - Content-Type 只回白名单里的图片类型，其它一律 octet-stream + 强制下载
//   - nosniff / CSP 一律带上，防止图片被当成脚本执行
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { attachmentAbsPath, readAttachment } from "@/lib/attachments";
import { INLINE_SAFE } from "@/lib/image-sniff";

export const dynamic = "force-dynamic";

function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    // 附件是用户私有内容，不允许被别的站外嵌
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const attachmentId = Number(id);
  if (!Number.isInteger(attachmentId)) {
    return new Response("bad id", { status: 400 });
  }

  const shareToken = new URL(request.url).searchParams.get("share");

  // 先拿元数据（不含文件），鉴权通过再去碰磁盘
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, userId: true, entryId: true, path: true, mime: true, filename: true },
  });
  if (!attachment) return new Response("not found", { status: 404 });

  let allowed = false;

  if (shareToken) {
    // 分享页：token 必须属于「这个附件挂着的那个条目」
    if (attachment.entryId) {
      const entry = await prisma.entry.findUnique({
        where: { id: attachment.entryId },
        select: { shareToken: true },
      });
      allowed = Boolean(entry?.shareToken) && entry!.shareToken === shareToken;
    }
  } else {
    const session = await getSession();
    allowed = Boolean(session.userId) && session.userId === attachment.userId;
  }

  if (!allowed) return new Response("unauthorized", { status: 401 });

  const buf = await readAttachment(attachmentAbsPath(attachment.path));
  if (!buf) return new Response("missing file", { status: 404 });

  const inline = INLINE_SAFE.has(attachment.mime);
  const headers: Record<string, string> = {
    ...securityHeaders(),
    "Content-Type": inline ? attachment.mime : "application/octet-stream",
    "Content-Length": String(buf.byteLength),
    // 私有内容：浏览器可以缓存，但中间代理不许存
    "Cache-Control": "private, max-age=86400",
  };
  if (!inline) {
    headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(attachment.filename)}"`;
  }

  return new Response(new Uint8Array(buf), { headers });
}
