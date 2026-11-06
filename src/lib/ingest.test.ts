import { test } from "node:test";
import assert from "node:assert/strict";
import { detectKind, extractUrlsFromText, hashUrl, parseTags } from "./url.ts";

test("按域名判断类型", () => {
  assert.equal(detectKind("https://www.bilibili.com/video/BV1xx"), "video");
  assert.equal(detectKind("https://youtu.be/abc"), "video");
  assert.equal(detectKind("https://www.xiaoyuzhoufm.com/episode/1"), "podcast");
  assert.equal(detectKind("https://mp.weixin.qq.com/s/abc"), "article");
  assert.equal(detectKind("坏的链接"), "article");
});

test("urlHash 稳定且区分大小写", () => {
  const a = hashUrl("https://example.com/A");
  const b = hashUrl("https://example.com/A");
  const c = hashUrl("https://example.com/a");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
});

test("标签解析去重与限长", () => {
  assert.deepEqual(parseTags("时文, 认知，时文"), ["时文", "认知"]);
  assert.deepEqual(parseTags("  "), []);
  assert.deepEqual(parseTags("a".repeat(31)), []);
});

test("从文本里抠链接并去掉尾部标点", () => {
  const text = "看这个 https://example.com/a。还有 https://example.com/b, 以及重复 https://example.com/a";
  assert.deepEqual(extractUrlsFromText(text), ["https://example.com/a", "https://example.com/b"]);
});

test("链接数量上限", () => {
  const text = Array.from({ length: 150 }, (_, i) => `https://example.com/${i}`).join(" ");
  assert.equal(extractUrlsFromText(text).length, 100);
});
