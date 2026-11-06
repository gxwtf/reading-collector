// 纯函数：不依赖数据库，便于单元测试
import { createHash } from "node:crypto";

const URL_RE = /https?:\/\/[^\s<>"'）)】，。]+/gi;

export type Kind = "article" | "video" | "podcast" | "document";

const VIDEO_HOSTS = [
  "bilibili.com", "b23.tv", "youtube.com", "youtu.be", "vimeo.com",
  "youku.com", "iqiyi.com", "v.qq.com", "mgtv.com", "douyin.com",
  "tiktok.com", "xigua.com", "weibo.com/tv", "twitter.com", "x.com",
];

const PODCAST_HOSTS = [
  "xiaoyuzhoufm.com", "podcasts.apple.com", "spotify.com",
  "soundcloud.com", "anchor.fm", "podbean.com", "overcast.fm",
];

/** 按域名/后缀粗判类型；真正判定交给 worker */
export function detectKind(url: string): Kind {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    path = u.pathname;
  } catch {
    return "article";
  }

  if (/\.pdf$/i.test(path)) return "document";
  if (/(arxiv\.org\/pdf|docs\.google\.com|yuque\.com|feishu\.cn\/docs)/.test(`${host}${path}`)) {
    return "document";
  }
  if (VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "video";
  if (PODCAST_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "podcast";
  return "article";
}

export function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,，、]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 30),
    ),
  ).slice(0, 10);
}

/** 从一段文本里抠链接（去重、限 100 条） */
export function extractUrlsFromText(text: string, limit = 100): string[] {
  const found = text.match(URL_RE) ?? [];
  const cleaned = found.map((u) => u.replace(/[.,;:!?]+$/, ""));
  return Array.from(new Set(cleaned)).slice(0, limit);
}
