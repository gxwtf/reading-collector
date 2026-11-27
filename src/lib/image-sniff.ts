/**
 * 图片嗅探与尺寸解析：纯函数，不碰数据库和文件系统，便于单测。
 *
 * 安全上只认「文件头」，不认前端给的 Content-Type——后者是浏览器按扩展名
 * 猜的，改个后缀就能伪造。
 */

/**
 * 允许的图片类型。
 *
 * 刻意**不含 SVG**：SVG 是 XML，可以内嵌 <script>，一旦被直接打开就是同源下
 * 的脚本执行（存储型 XSS）。收藏图片用不到矢量图。
 * 也不含 HEIC/HEIF：浏览器普遍不能显示，收了也看不了。
 */
export const ALLOWED_IMAGE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
} as const;

export type AllowedImageMime = keyof typeof ALLOWED_IMAGE;

/** 按文件头嗅探 MIME。返回 null 表示不是我们认识的图片。 */
export function sniffImageMime(buf: Uint8Array): AllowedImageMime | null {
  const at = (i: number) => buf[i] ?? 0;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(4) === 0x0d && at(5) === 0x0a) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return "image/jpeg";
  }
  // GIF: "GIF87a" / "GIF89a"
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) {
    return "image/gif";
  }
  // WEBP: "RIFF"...."WEBP"；同为 RIFF 的 WAV 不能被误判
  if (
    at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 &&
    at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50
  ) {
    return "image/webp";
  }
  // BMP: "BM"
  if (at(0) === 0x42 && at(1) === 0x4d) {
    return "image/bmp";
  }
  // AVIF: 第 4..8 字节是 "ftyp"，随后是品牌
  if (at(4) === 0x66 && at(5) === 0x74 && at(6) === 0x79 && at(7) === 0x70) {
    const brand = String.fromCharCode(at(8), at(9), at(10), at(11));
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

/**
 * 读 PNG / GIF / BMP 的宽高，给 <img> 预留位置避免页面抖动。
 * JPEG / WebP / AVIF 的解析复杂得多，不值得为这点收益写进来——返回 null。
 */
export function readImageSize(buf: Uint8Array, mime: string): { width: number; height: number } | null {
  try {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (mime === "image/png" && buf.byteLength >= 24) {
      // 8 字节签名 + 4 字节长度 + 4 字节 "IHDR" 之后才是宽高
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (mime === "image/gif" && buf.byteLength >= 10) {
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }
    if (mime === "image/bmp" && buf.byteLength >= 26) {
      return { width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) };
    }
  } catch {
    return null;
  }
  return null;
}

/** 这些类型可以在浏览器里安全内联显示，其余一律强制下载 */
export const INLINE_SAFE = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
]);
