import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import { ALLOWED_IMAGE, readImageSize, sniffImageMime } from "@/lib/image-sniff";

/**
 * 图片等附件的落盘与读取。
 *
 * 设计参考 memos 的 Attachment：二进制放磁盘、元数据进库、访问走鉴权路由。
 * 按本站情况做了简化——memos 要支持 S3 / 数据库 / 外部链接三种存储，还要处理
 * HEIC / Motion Photo / HDR，这里只需要本地磁盘。
 *
 * 三条硬规矩（都是 memos fileserver 踩过的）：
 * 1. **不信任前端给的 Content-Type**，按文件头嗅探（见 image-sniff.ts）。
 * 2. **只收白名单里的图片**；HTML / SVG 这类可执行脚本的格式绝不能当图片存。
 * 3. **读取时重新校验归属**：`where: { id, userId }`，别人的附件一律当不存在。
 */

export const UPLOAD_DIR = process.env.UPLOAD_DIR || "/home/gxwtf/reading-uploads";

/** 单张图片上限 20MB。手机原图 3-8MB 很常见，给足余量。 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = ALLOWED_IMAGE;

/** 每个用户的附件根目录：UPLOAD_DIR/u<userId> */
export function uploadRoot(userId: number): string {
  return path.join(UPLOAD_DIR, `u${userId}`);
}

/** 文件名只留主体，去掉路径与危险字符 */
function safeBaseName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[/\\:*?"<>|\u0000-\u001f]/g, "_")
      .trim()
      .slice(0, 100) || "image"
  );
}

export type SaveImageResult =
  | { ok: true; attachment: { id: number; url: string; width: number | null; height: number | null } }
  | { ok: false; error: string };

/**
 * 校验并保存一张图片。
 *
 * 磁盘上用随机文件名：原文件名可能重复、可能是中文、可能带 `..`，全都得处理。
 * 展示用的原名存 `filename` 列。
 */
export async function saveImage(
  userId: number,
  file: File,
  entryId?: number | null,
): Promise<SaveImageResult> {
  if (file.size <= 0) return { ok: false, error: "文件是空的" };
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: `图片超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB` };
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(buf);
  if (!mime) {
    return { ok: false, error: "只支持 PNG / JPEG / GIF / WebP / AVIF / BMP 图片" };
  }

  const ext = EXT_BY_MIME[mime];
  const stored = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${ext}`;
  const relative = `u${userId}/${stored}`;
  const abs = path.join(UPLOAD_DIR, relative);

  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf);

  const size = readImageSize(buf, mime);

  try {
    const row = await prisma.attachment.create({
      data: {
        userId,
        entryId: entryId ?? null,
        filename: `${safeBaseName(file.name)}.${ext}`,
        path: relative,
        mime,
        // 存嗅探后的实际字节数，不是 file.size
        size: buf.byteLength,
        width: size?.width ?? null,
        height: size?.height ?? null,
      },
      select: { id: true, width: true, height: true },
    });
    return {
      ok: true,
      attachment: { id: row.id, url: `/api/attachments/${row.id}`, width: row.width, height: row.height },
    };
  } catch (error) {
    // 入库失败就把刚落盘的文件删掉，别留孤儿
    await unlink(abs).catch(() => undefined);
    throw error;
  }
}

/** 取附件并校验归属；别人的附件当不存在 */
export async function getOwnedAttachment(id: number, userId: number) {
  return prisma.attachment.findFirst({
    where: { id, userId },
    select: { id: true, path: true, mime: true, filename: true, size: true, entryId: true },
  });
}

/** 相对路径 → 绝对路径。path 列只存相对路径，换盘只改 UPLOAD_DIR。 */
export function attachmentAbsPath(relative: string): string {
  return path.join(UPLOAD_DIR, relative);
}

/** 读取附件字节（调用方必须先校验归属） */
export async function readAttachment(absPath: string): Promise<Buffer | null> {
  try {
    const info = await stat(absPath);
    if (!info.isFile()) return null;
    return await readFile(absPath);
  } catch {
    return null;
  }
}

/** 内容指纹，用于去重判断 */
export function contentHash(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 32);
}
