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

export type CollectionItem = { title: string; url: string };
export type CollectionResult = {
  kind: "season" | "parts" | "single";
  title: string;
  items: CollectionItem[];
};

/** 解析一个视频链接：多 P 分集 / UP 主合集 / 单集 */
export async function fetchCollection(videoUrl: string): Promise<CollectionResult> {
  const bvid = videoUrl.match(/BV[0-9A-Za-z]+/)?.[0];
  if (!bvid) throw new Error("链接里没有 BV 号");

  const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`B 站接口返回 ${res.status}`);

  const json = (await res.json()) as {
    code: number;
    message?: string;
    data?: {
      title: string;
      pages?: { page: number; part: string }[];
      ugc_season?: {
        title: string;
        sections?: { episodes: { bvid: string; title: string }[] }[];
      };
    };
  };

  if (json.code !== 0) throw new Error(json.message || "读取失败");
  const data = json.data!;

  const season = data.ugc_season;
  if (season?.sections?.length) {
    const items = season.sections.flatMap((s) =>
      s.episodes.map((e) => ({
        title: e.title,
        url: `https://www.bilibili.com/video/${e.bvid}`,
      })),
    );
    return { kind: "season", title: season.title, items };
  }

  const pages = data.pages ?? [];
  if (pages.length > 1) {
    return {
      kind: "parts",
      title: data.title,
      items: pages.map((p) => {
        // B 站的分 P 标题经常把整片标题重复一遍，去掉后取剩下的部分
        const extra = (p.part || "").replace(data.title, "").trim();
        return {
          title: extra ? `P${p.page} ${extra}` : `P${p.page}`,
          url: `https://www.bilibili.com/video/${bvid}?p=${p.page}`,
        };
      }),
    };
  }

  return {
    kind: "single",
    title: data.title,
    items: [{ title: data.title, url: `https://www.bilibili.com/video/${bvid}` }],
  };
}
