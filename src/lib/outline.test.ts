import { test } from "node:test";
import assert from "node:assert/strict";
import { extractOutline } from "./outline.ts";

test("基本：h1–h4 按出现顺序，level 分别 1,2,3,4", () => {
  const items = extractOutline("# 一\n\n## 二\n\n### 三\n\n#### 四");
  assert.deepEqual(
    items.map((i) => [i.level, i.text]),
    [
      [1, "一"],
      [2, "二"],
      [3, "三"],
      [4, "四"],
    ],
  );
});

test("h5/h6 不进目录", () => {
  assert.deepEqual(extractOutline("##### 五\n###### 六"), []);
});

test("代码块里的 # 不算标题", () => {
  const md = "# 真标题\n```\n# 这是代码注释不是标题\n```";
  const items = extractOutline(md);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "真标题");
});

test("行内代码里的 # 不算标题", () => {
  assert.deepEqual(extractOutline("这是 `# 不是标题` 的正文"), []);
});

test("ATX 闭合井号去掉", () => {
  const [item] = extractOutline("## 标题 ##");
  assert.equal(item.text, "标题");
});

test("去掉行内标记：加粗与链接", () => {
  const [item] = extractOutline("## **加粗**的[链接](http://x)");
  assert.equal(item.text, "加粗的链接");
});

test("slug 唯一：重名加 -2 后缀", () => {
  const items = extractOutline("## 重复\n\n## 重复");
  assert.equal(items.length, 2);
  assert.notEqual(items[0].slug, items[1].slug);
  assert.equal(items[0].slug, "重复");
  assert.equal(items[1].slug, "重复-2");
});

test("slug 规则：中文保留、空格转 -、去掉 URL 特殊字符", () => {
  const [cn] = extractOutline("## 认知科学");
  assert.ok(cn.slug.includes("认知科学"), cn.slug);

  const [mixed] = extractOutline("## 认知科学 What? #1 / A");
  assert.equal(mixed.slug, "认知科学-what-1--a");
  assert.doesNotMatch(mixed.slug, /[?#/\s]/);
});

test("空输入与无标题正文都返回 []", () => {
  assert.deepEqual(extractOutline(""), []);
  assert.deepEqual(extractOutline("没有标题的正文"), []);
});

test("井号后必须有空格", () => {
  assert.deepEqual(extractOutline("#标题"), []);
});

test("最多 3 个空格缩进仍算标题", () => {
  const [item] = extractOutline("  # 前面有空格");
  assert.equal(item.text, "前面有空格");
  assert.equal(item.level, 1);
});

test("CRLF 换行", () => {
  const items = extractOutline("# 一\r\n## 二");
  assert.deepEqual(
    items.map((i) => [i.level, i.text]),
    [
      [1, "一"],
      [2, "二"],
    ],
  );
});

test("4 空格缩进是缩进代码块，不算标题", () => {
  assert.deepEqual(extractOutline("    # 代码块里的标题"), []);
});

test("未闭合的代码块一直吃到文末", () => {
  const items = extractOutline("# 开头\n```\n## 块内\n# 还是块内");
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "开头");
});

test("代码块闭合后恢复识别", () => {
  const md = "# 甲\n```js\nconst x = 1;\n# 注释\n```\n## 乙";
  assert.deepEqual(
    extractOutline(md).map((i) => i.text),
    ["甲", "乙"],
  );
});

test("行内代码、图片、删除线、斜体都在 text 里被清掉", () => {
  const [item] = extractOutline("### 用 `npm` 跑 ![图](a.png) ~~旧~~ *新* 的 _方法_");
  assert.equal(item.text, "用 npm 跑 图 旧 新 的 方法");
});

test("snake_case 不该被当成斜体", () => {
  const [item] = extractOutline("# fetch_user_data 接口");
  assert.equal(item.text, "fetch_user_data 接口");
});

test("C# 这类结尾井号不是闭合标记", () => {
  const [item] = extractOutline("## 学 C#");
  assert.equal(item.text, "学 C#");
});

test("`## ##` 这种没有可显示文本的标题被跳过", () => {
  assert.deepEqual(extractOutline("## ##"), []);
});

test("slug 全被清空时退回 section", () => {
  const [item] = extractOutline("## ???");
  assert.equal(item.slug, "section");
});

test("三级重名：-2、-3", () => {
  const items = extractOutline("## 重复\n## 重复\n## 重复");
  assert.deepEqual(
    items.map((i) => i.slug),
    ["重复", "重复-2", "重复-3"],
  );
});
