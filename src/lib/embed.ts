/** 从视频/播客 URL 推导可嵌入的播放器地址，并支持按秒跳转 */

export type EmbedProvider = "bilibili" | "youtube" | "spotify";

export type Embed = {
  provider: EmbedProvider;
  /** 不带时间参数的播放器地址 */
  base: string;
  ratio: string;
};

export function getEmbed(url: string, kind: string): Embed | null {
  if (kind !== "video" && kind !== "podcast") return null;

  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  if (host.endsWith("bilibili.com")) {
    const bv = url.match(/(BV[0-9A-Za-z]+)/)?.[1];
    if (bv) {
      return {
        provider: "bilibili",
        base: `https://player.bilibili.com/player.html?bvid=${bv}&autoplay=0&danmaku=0&high_quality=1`,
        ratio: "16 / 9",
      };
    }
    return null;
  }

  if (host.endsWith("youtube.com") || host.endsWith("youtu.be")) {
    const id = url.match(/(?:v=|youtu\.be\/)([0-9A-Za-z_-]{6,})/)?.[1];
    if (id) {
      return {
        provider: "youtube",
        base: `https://www.youtube.com/embed/${id}?rel=0`,
        ratio: "16 / 9",
      };
    }
    return null;
  }

  if (host.endsWith("spotify.com")) {
    const id = url.match(/episode\/([0-9A-Za-z]+)/)?.[1] ?? url.match(/show\/([0-9A-Za-z]+)/)?.[1];
    if (id) {
      return {
        provider: "spotify",
        base: `https://open.spotify.com/embed/episode/${id}`,
        ratio: "16 / 9",
      };
    }
    return null;
  }

  return null;
}

/** 给播放器地址加上「从第 N 秒开始 + 自动播放」 */
export function seekUrl(embed: Embed, seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  if (embed.provider === "youtube") {
    return `${embed.base}&start=${t}&autoplay=1`;
  }
  if (embed.provider === "bilibili") {
    return `${embed.base.replace("autoplay=0", "autoplay=1")}&t=${t}`;
  }
  return embed.base;
}
