// 纯函数：不依赖数据库，便于单元测试

/** 按域名粗判类型；真正判定交给 worker */
export export function detectKind(url: string): "article" | "video" | "podcast" {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "article";
  }
  if (/(bilibili\.com|youtu\.be|youtube\.com|vimeo\.com)/.test(host)) return "video";
  if (/(xiaoyuzhoufm\.com|podcasts\.apple\.com|spotify\.com)/.test(host)) return "podcast";
  return "article";
}

export export function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export export function parseTags(raw: string): string[] {
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
export export function extractUrlsFromText(text: string, limit = 100): string[] {
  const found = text.match(URL_RE) ?? [];
  const cleaned = found.map((u) => u.replace(/[.,;:!?]+$/, ""));
  return Array.from(new Set(cleaned)).slice(0, limit);
}
