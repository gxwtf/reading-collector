import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeMarkdown } from "./summarize.ts";

test("有标题的文章按节取首句", () => {
  const md = `
开篇先说结论，这句话应该被跳过因为前面没有标题。

## 第一节

这是第一节的第一句话。这是第二节内容。第三句不该出现。

## 第二节

第二节的开头讲了一个机制。后面还有很多细节。
`;
  const out = summarizeMarkdown(md);
  assert.match(out, /^## 分章要点/);
  assert.match(out, /第一节：这是第一节的第一句话。/);
  assert.match(out, /第二节：第二节的开头讲了一个机制。/);
  assert.ok(!out.includes("第三句不该出现"));
});

test("没有标题的长文按位置切段", () => {
  const long = Array.from({ length: 40 }, (_, i) => `第${i}句写了一些内容，用来测试切段逻辑是否工作。`).join("");
  const out = summarizeMarkdown(long);
  const bullets = out.split("\n").filter((l) => l.startsWith("- "));
  assert.ok(bullets.length >= 3, "至少应有三条要点");
  assert.ok(bullets.length <= 8, "最多八条要点");
});

test("短内容只产出一条要点", () => {
  const out = summarizeMarkdown("太短了");
  assert.match(out, /^## 分章要点/);
  assert.equal(out.split("\n").filter((l) => l.startsWith("- ")).length, 1);
});

test("去掉 Markdown 链接语法", () => {
  const md = "## 小节\n\n参见[这篇文章](https://example.com/a)里的说法，它很重要。";
  const out = summarizeMarkdown(md);
  assert.ok(out.includes("这篇文章"));
  assert.ok(!out.includes("https://example.com"));
});
