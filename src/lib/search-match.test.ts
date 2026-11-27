import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareSearchTerms, findSearchMatches } from "./search-match.ts";

// —— 大小写折叠 ——
test("大小写折叠：Hello 命中 hello", () => {
  assert.deepEqual(findSearchMatches("Hello World", ["hello"]), [
    { start: 0, end: 5 },
  ]);
});

test("大小写折叠：反向也成立（正文小写、词大写）", () => {
  assert.deepEqual(findSearchMatches("hello", ["HELLO"]), [
    { start: 0, end: 5 },
  ]);
});

// —— 中文 ——
test("中文：按 UTF-16 下标命中", () => {
  assert.deepEqual(findSearchMatches("认知科学很重要", ["认知"]), [
    { start: 0, end: 2 },
  ]);
});

test("中文：命中在中间", () => {
  assert.deepEqual(findSearchMatches("我很喜欢认知科学", ["认知"]), [
    { start: 4, end: 6 },
  ]);
});

// —— 英文子串 ——
test("英文子串：cd 落在 abcdef 中间", () => {
  assert.deepEqual(findSearchMatches("abcdef", ["cd"]), [
    { start: 2, end: 4 },
  ]);
});

test("英文子串：整段命中", () => {
  assert.deepEqual(findSearchMatches("abc", ["abc"]), [{ start: 0, end: 3 }]);
});

// —— 同一词多次出现 ——
test("同一词多次出现：a 在 aXaXa 里出现 3 次且互不重叠", () => {
  const hits = findSearchMatches("aXaXa", ["a"]);
  assert.equal(hits.length, 3);
  assert.deepEqual(hits, [
    { start: 0, end: 1 },
    { start: 2, end: 3 },
    { start: 4, end: 5 },
  ]);
  // 断言互不重叠：后一段起点必须 >= 前一段终点
  for (let i = 1; i < hits.length; i++) {
    assert.ok(hits[i].start >= hits[i - 1].end);
  }
});

// —— 多词 ——
test("多词：foo 与 bar 各一段，按 start 升序", () => {
  const hits = findSearchMatches("foo bar", ["foo", "bar"]);
  assert.equal(hits.length, 2);
  assert.deepEqual(hits, [
    { start: 0, end: 3 },
    { start: 4, end: 7 },
  ]);
});

test("多词：输入顺序颠倒，输出仍按 start 升序", () => {
  const hits = findSearchMatches("foo bar", ["bar", "foo"]);
  assert.deepEqual(hits, [
    { start: 0, end: 3 },
    { start: 4, end: 7 },
  ]);
});

// —— 重叠合并 ——
test("重叠合并：abc + cde 合并成 0..5", () => {
  assert.deepEqual(findSearchMatches("abcde", ["abc", "cde"]), [
    { start: 0, end: 5 },
  ]);
});

test("重叠合并：一个词被另一个词完全包含", () => {
  // "abc" 覆盖 [0,3)，"b" 覆盖 [1,2)，后者在前者内部，应并成一段
  assert.deepEqual(findSearchMatches("abc", ["abc", "b"]), [
    { start: 0, end: 3 },
  ]);
});

test("重叠合并：紧贴但不重叠的区间也合并（避免相邻高亮碎片）", () => {
  // "ab" 覆盖 [0,2)，"cd" 覆盖 [2,4)，首尾相接 → 合并成 [0,4)
  assert.deepEqual(findSearchMatches("abcd", ["ab", "cd"]), [
    { start: 0, end: 4 },
  ]);
});

// —— 不匹配 / 空输入 ——
test("不匹配返回空数组", () => {
  assert.deepEqual(findSearchMatches("abc", ["xyz"]), []);
});

test("空正文返回空数组", () => {
  assert.deepEqual(findSearchMatches("", ["a"]), []);
});

test("空词表返回空数组", () => {
  assert.deepEqual(findSearchMatches("abc", []), []);
});

test("词表里只有空串也不崩", () => {
  assert.deepEqual(findSearchMatches("abc", ["", ""]), []);
});

// —— prepareSearchTerms ——
test("prepareSearchTerms：去空白、去重、小写", () => {
  assert.deepEqual(prepareSearchTerms([" Foo ", "foo", "", "bar"]), [
    "foo",
    "bar",
  ]);
});

test("prepareSearchTerms：一个字符串里含多个词，按空白切开", () => {
  assert.deepEqual(prepareSearchTerms(["foo bar  Baz"]), [
    "foo",
    "bar",
    "baz",
  ]);
});

test("prepareSearchTerms：全角空格与不换行空格也算分隔符", () => {
  assert.deepEqual(prepareSearchTerms(["认知　科学 研究"]), [
    "认知",
    "科学",
    "研究",
  ]);
});

test("prepareSearchTerms：超过 60 字的词被丢弃", () => {
  const long = "x".repeat(61);
  const ok = "y".repeat(60);
  assert.deepEqual(prepareSearchTerms([long, ok]), [ok]);
});

test("prepareSearchTerms：最多保留 8 个词", () => {
  const terms = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const out = prepareSearchTerms(terms);
  assert.equal(out.length, 8);
  assert.deepEqual(out, ["a", "b", "c", "d", "e", "f", "g", "h"]);
});

// —— 不用正则：元字符按字面处理 ——
test("正则元字符按字面处理：搜 . 只命中真实的点", () => {
  // 如果用 new RegExp(".")，整段都会被匹配；indexOf 只命中下标 1 的那个点
  assert.deepEqual(findSearchMatches("a.b*c", ["."]), [
    { start: 1, end: 2 },
  ]);
});

test("正则元字符按字面处理：未闭合括号不抛异常", () => {
  assert.deepEqual(findSearchMatches("a(b", ["("]), [{ start: 1, end: 2 }]);
  assert.deepEqual(findSearchMatches("a(b", ["(b)"]), []);
});

test("正则元字符按字面处理：星号不当作量词", () => {
  assert.deepEqual(findSearchMatches("a*b", ["*"]), [{ start: 1, end: 2 }]);
});

// —— toLowerCase 改变长度时的回退 ——
test("toLowerCase 改变长度时回退大小写敏感匹配且不崩", () => {
  // "İ" (U+0130) 小写后是 "i" + 组合点，长度从 1 变 2，
  // 整串折叠后长度与原文不一致，应回退到原文大小写敏感匹配。
  const text = "İstanbul";
  const hit = findSearchMatches(text, ["İst"]);
  assert.deepEqual(hit, [{ start: 0, end: 3 }]);
  // 回退模式下大小写敏感：小写 "istanbul" 不应命中 "İstanbul"
  assert.deepEqual(findSearchMatches(text, ["istanbul"]), []);
});

// —— 综合：prepare + find 串起来 ——
test("端到端：prepare 后交给 find，多词重叠正确合并", () => {
  const terms = prepareSearchTerms([" 认知 ", "科学"]);
  assert.deepEqual(terms, ["认知", "科学"]);
  // "认知科学" 里 "认知"=[0,2) 与 "科学"=[2,4) 相邻 → 合并
  assert.deepEqual(findSearchMatches("认知科学", terms), [
    { start: 0, end: 4 },
  ]);
});
