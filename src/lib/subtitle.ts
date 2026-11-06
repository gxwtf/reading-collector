/** 解析 VTT / SRT 字幕，返回带时间戳的分段 */

export type SubSegment = { start: number; end: number; text: string };

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})/;

function sec(h: string, m: string, s: string, ms: string) {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

export function parseSubtitle(raw: string): SubSegment[] {
  const segments: SubSegment[] = [];
  let current: SubSegment | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("WEBVTT") || /^NOTE/.test(trimmed)) continue;

    const m = trimmed.match(TIME);
    if (m) {
      if (current?.text) segments.push(current);
      current = {
        start: sec(m[1], m[2], m[3], m[4]),
        end: sec(m[5], m[6], m[7], m[8]),
        text: "",
      };
      continue;
    }
    if (current) {
      const clean = trimmed.replace(/<[^>]+>/g, "").trim();
      if (clean) current.text = `${current.text} ${clean}`.trim();
    }
  }
  if (current?.text) segments.push(current);

  return segments.filter((s) => s.text.length > 0);
}
