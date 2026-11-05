/** 从视频/播客 URL 推导可嵌入的播放器地址 */

export type Embed = { kind: "iframe" | "audio"; url: string; ratio?: string };

export function getEmbed(url: string, kind: string): Embed | null {
  if (kind !== "video" && kind !== "podcast") return null;

  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  // B 站：BV 号播放器
  if (host.endsWith("bilibili.com")) {
    const bv = url.match(/(BV[0-9A-Za-z]+)/)?.[1];
    if (bv) return { kind: "iframe", url: `https://player.bilibili.com/player.html?bvid=${bv}&autoplay=0`, ratio: "16 / 9" };
    return null;
  }

  // YouTube
  if (host.endsWith("youtube.com") || host.endsWith("youtu.be")) {
    const id = url.match(/(?:v=|youtu\.be\/)([0-9A-Za-z_-]{6,})/)?.[1];
    if (id) return { kind: "iframe", url: `https://www.youtube.com/embed/${id}`, ratio: "16 / 9" };
    return null;
  }

  // Spotify 播客 / 单集
  if (host.endsWith("spotify.com")) {
    const id = url.match(/episode\/([0-9A-Za-z]+)/)?.[1] ?? url.match(/show\/([0-9A-Za-z]+)/)?.[1];
    if (id) return { kind: "iframe", url: `https://open.spotify.com/embed/episode/${id}`, ratio: "16 / 9" };
    return null;
  }

  return null;
}
