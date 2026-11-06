import { test } from "node:test";
import assert from "node:assert/strict";
import { mmss } from "./time.ts";

test("mmss 补零与进位", () => {
  assert.equal(mmss(0), "00:00");
  assert.equal(mmss(65), "01:05");
  assert.equal(mmss(600), "10:00");
  assert.equal(mmss(3599), "59:59");
});

test("mmss 超过一小时带小时位", () => {
  assert.equal(mmss(3600), "1:00:00");
  assert.equal(mmss(3725), "1:02:05");
});

test("mmss 负数与小数不炸", () => {
  assert.equal(mmss(-5), "00:00");
  assert.equal(mmss(12.9), "00:12");
});
