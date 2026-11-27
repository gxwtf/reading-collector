import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeTime } from "./relative-time.ts";

// 固定「现在」，否则用例跨分钟就飘
const NOW = new Date("2026-11-27T12:00:00+08:00").getTime();
const at = (iso: string) => relativeTime(new Date(iso), NOW);

test("一分钟内是刚刚", () => {
  assert.equal(at("2026-11-27T11:59:30+08:00"), "刚刚");
});

test("分钟与小时", () => {
  assert.equal(at("2026-11-27T11:45:00+08:00"), "15 分钟前");
  assert.equal(at("2026-11-27T09:00:00+08:00"), "3 小时前");
});

test("昨天按日历天算，不按 24 小时", () => {
  // 23:50 收藏，次日 00:10 打开 —— 只过了 20 分钟，但确实是「昨天」
  assert.equal(
    relativeTime(new Date("2026-11-26T23:50:00+08:00"), new Date("2026-11-27T00:10:00+08:00")),
    "昨天",
  );
});

test("N 天前与上周", () => {
  assert.equal(at("2026-11-24T12:00:00+08:00"), "3 天前");
  assert.equal(at("2026-11-21T12:00:00+08:00"), "6 天前");
  assert.equal(at("2026-11-18T12:00:00+08:00"), "上周");
  assert.equal(at("2026-11-14T12:00:00+08:00"), "上周");
});

test("超过两周退回绝对日期", () => {
  assert.equal(at("2026-11-01T12:00:00+08:00"), "11-01");
  assert.equal(at("2025-11-01T12:00:00+08:00"), "2025-11-01");
});

test("未来时间不出现负数", () => {
  assert.equal(at("2026-11-27T12:05:00+08:00"), "刚刚");
});

test("非法输入返回空串，不抛错", () => {
  assert.equal(relativeTime("not-a-date", NOW), "");
});
