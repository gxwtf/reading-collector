import { test } from "node:test";
import assert from "node:assert/strict";
import { KINDS, isKind, kindLabel } from "./kind.ts";

test("四种类型都有中文名", () => {
  for (const k of KINDS) {
    assert.notEqual(kindLabel(k), "", `${k} 没有中文名`);
  }
  assert.deepEqual(
    KINDS.map(kindLabel),
    ["文章", "视频", "播客", "文档"],
  );
});

test("分享图的 quote 版式叫「摘录」，不能退化成「文章」", () => {
  // 金句分享图走 /api/share-card?kind=quote（AnnotationShareButton / HighlightList）。
  // 这里漏过 quote，重建后卡片顶部会显示「文章」。
  assert.equal(kindLabel("quote"), "摘录");
});

test("未知 / 空值退回「文章」，不返回 undefined", () => {
  assert.equal(kindLabel("image"), "文章");
  assert.equal(kindLabel(null), "文章");
  assert.equal(kindLabel(undefined), "文章");
  assert.equal(kindLabel(""), "文章");
});

test("isKind 只认四种真值", () => {
  assert.equal(isKind("video"), true);
  assert.equal(isKind("image"), false);
  assert.equal(isKind("quote"), false, "quote 是分享版式，不是条目类型");
  assert.equal(isKind(null), false);
});
