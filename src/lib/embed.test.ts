import { test } from "node:test";
import assert from "node:assert/strict";
import { getEmbed, seekUrl } from "./embed.ts";

test("B 站视频能解析出 bvid 与播放器地址", () => {
  const embed = getEmbed("https://www.bilibili.com/video/BV1wWJa61Ee3?spm=1", "video");
  assert.ok(embed);
  assert.equal(embed.provider, "bilibili");
  assert.match(embed.base, /bvid=BV1wWJa61Ee3/);
});

test("YouTube 长短链都能解析", () => {
  const a = getEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "video");
  const b = getEmbed("https://youtu.be/dQw4w9WgXcQ", "video");
  assert.equal(a?.provider, "youtube");
  assert.equal(b?.provider, "youtube");
  assert.match(a!.base, /embed\/dQw4w9WgXcQ/);
});

test("文章 / 非法链接不产生嵌入", () => {
  assert.equal(getEmbed("https://mp.weixin.qq.com/s/abc", "article"), null);
  assert.equal(getEmbed("not-a-url", "video"), null);
});

test("跳转参数按平台拼接", () => {
  const yt = getEmbed("https://youtu.be/dQw4w9WgXcQ", "video")!;
  assert.match(seekUrl(yt, 90), /start=90/);
  assert.match(seekUrl(yt, 90), /autoplay=1/);

  const bili = getEmbed("https://www.bilibili.com/video/BV1wWJa61Ee3", "video")!;
  assert.match(seekUrl(bili, 90), /t=90/);
});
