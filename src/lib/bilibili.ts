/** B 站收藏夹读取：公开收藏夹无需登录；私密收藏夹需要 BILI_SESSDATA 环境变量 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type FavItem = {
  bvid: string;
  title: string;
  url: string;
  cover: string;
  duration: number;
  upper: string;
};

export type FavPage = {
  title: string;
  total: number;
  hasMore: boolean;
  items: FavItem[];
};

function headers() {
  const cookie = process.env.BILI_SESSDATA
    ? `SESSDATA=${process.env.BILI_SESSDATA}`
    : "";
  return {
    "User-Agent": UA,
    Referer: "https://www.bilibili.com/",
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

export async function fetchFavPage(mediaId: string, page = 1, pageSize = 20): Promise<FavPage> {
  const url = `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${encodeURIComponent(
    mediaId,
  )}&pn=${page}&ps=${pageSize}&platform=web&keyword=&order=mtime&type=0&tid=0`;

  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`B 站接口返回 ${res.status}`);

  const json = (await res.json()) as {
    code: number;
    message?: string;
    data?: {
      info?: { title?: string; media_count?: number };
      medias?: { bvid: string; title: string; cover?: string; duration?: number; upper?: { name?: string } }[];
      has_more?: boolean;
    };
  };

  if (json.code !== 0) {
    const hint =
      json.code === -403
        ? "收藏夹是私密的，需要在服务器 .env 配置 BILI_SESSDATA"
        : json.message || "读取失败";
    throw new Error(`${hint}（code ${json.code}）`);
  }

  const items = (json.data?.medias ?? []).map((m) => ({
    bvid: m.bvid,
    title: m.title,
    url: `https://www.bilibili.com/video/${m.bvid}`,
    cover: m.cover ?? "",
    duration: Number(m.duration ?? 0),
    upper: m.upper?.name ?? "",
  }));

  return {
    title: json.data?.info?.title ?? "B 站收藏夹",
    total: Number(json.data?.info?.media_count ?? items.length),
    hasMore: Boolean(json.data?.has_more),
    items,
  };
}

/** 从收藏夹链接/ID 里抠出 media_id */
export function parseMediaId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/[?&]fid=(\d+)/) || trimmed.match(/media_id=(\d+)/);
  return m ? m[1] : null;
}
