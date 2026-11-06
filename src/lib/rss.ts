/** 轻量 RSS / Atom 解析：不引第三方依赖，够用即可 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type RssItem = {
  title: string;
  url: string;
  summary: string;
  published: string | null;
  hasFullText: boolean;
};

export type RssFeed = { title: string; items: RssItem[] };

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(block: string, tags: string[]): string {
  for (const tag of tags) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
    const m = block.match(re);
    if (m?.[1]) return m[1];
  }
  return "";
}

function attr(block: string, tag: string, name: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*\\s${name}=["']([^"']+)["']`, "i"));
  return m?.[1] ?? "";
}

/** 从 feed 里解析条目；RSS 2.0 与 Atom 都覆盖 */
export function parseFeed(xml: string): RssFeed {
  const feedTitle = decode(pick(xml, ["title"])) || "RSS";

  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) ?? [];
  const items: RssItem[] = [];

  for (const block of blocks) {
    const title = decode(pick(block, ["title"])) || "(无标题)";

    let url = decode(pick(block, ["link"])).trim();
    if (!url || !/^https?:/i.test(url)) {
      url = attr(block, "link", "href");
    }
    if (!url) {
      const guid = decode(pick(block, ["guid", "id"])).trim();
      if (/^https?:/i.test(guid)) url = guid;
    }
    if (!url) continue;

    const summary = decode(pick(block, ["description", "summary", "content:encoded", "content"]));
    const content = decode(pick(block, ["content:encoded", "content"]));
    const published = decode(pick(block, ["pubDate", "published", "updated"])) || null;

    items.push({
      title,
      url,
      summary: summary.slice(0, 300),
      published,
      // 判据很朴素：正文明显长于摘要，说明 feed 里就带了全文
      hasFullText: content.length > 800,
    });
  }

  return { title: feedTitle, items: items.slice(0, 100) };
}

export async function fetchFeed(url: string): Promise<RssFeed> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`抓取 feed 失败：${res.status}`);
  const xml = await res.text();
  if (!/<(rss|feed|rdf:RDF)/i.test(xml)) throw new Error("这个地址不像 RSS / Atom");
  return parseFeed(xml);
}
