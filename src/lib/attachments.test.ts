import { test } from "node:test";
import assert from "node:assert/strict";
import { INLINE_SAFE, readImageSize, sniffImageMime } from "./image-sniff.ts";

/** 造一个以给定字节开头的缓冲区 */
function bytes(prefix: number[], length = 64): Uint8Array {
  const buf = new Uint8Array(length);
  prefix.forEach((b, i) => {
    buf[i] = b;
  });
  return buf;
}

test("识别常见图片格式", () => {
  assert.equal(sniffImageMime(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffImageMime(bytes([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImageMime(bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), "image/gif");
  assert.equal(sniffImageMime(bytes([0x42, 0x4d, 0, 0])), "image/bmp");
});

test("RIFF 容器里只有 WEBP 才算图片", () => {
  const webp = bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(sniffImageMime(webp), "image/webp");

  // 同样以 RIFF 开头的 WAV 不是图片
  const wav = bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
  assert.equal(sniffImageMime(wav), null);
});

test("AVIF 按 ftyp 品牌识别", () => {
  const avif = bytes([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
  assert.equal(sniffImageMime(avif), "image/avif");
});

test("拒绝可执行脚本的格式（存储型 XSS 防线）", () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(sniffImageMime(svg), null, "SVG 能内嵌脚本，绝不能当图片收");

  const html = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>");
  assert.equal(sniffImageMime(html), null);

  const js = new TextEncoder().encode("alert(document.cookie)");
  assert.equal(sniffImageMime(js), null);
});

test("空文件与随机字节返回 null", () => {
  assert.equal(sniffImageMime(new Uint8Array(0)), null);
  assert.equal(sniffImageMime(bytes([1, 2, 3, 4, 5, 6, 7, 8])), null);
});

test("PNG 宽高从 IHDR 读", () => {
  const buf = new Uint8Array(32);
  // 签名 + 长度 + "IHDR" 占前 16 字节，宽高在其后
  const view = new DataView(buf.buffer);
  view.setUint32(16, 1920);
  view.setUint32(20, 1080);
  assert.deepEqual(readImageSize(buf, "image/png"), { width: 1920, height: 1080 });
});

test("JPEG 不解析宽高（返回 null，不抛错）", () => {
  assert.equal(readImageSize(bytes([0xff, 0xd8, 0xff]), "image/jpeg"), null);
});

test("截断的图不会让 readImageSize 崩", () => {
  assert.equal(readImageSize(new Uint8Array(4), "image/png"), null);
});

test("内联白名单不含任何可执行类型", () => {
  assert.ok(INLINE_SAFE.has("image/png"));
  assert.ok(!INLINE_SAFE.has("image/svg+xml"));
  assert.ok(!INLINE_SAFE.has("text/html"));
});
