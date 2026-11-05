/** 抽取式概括：不依赖大模型，取每节首句，最多 8 条要点 */

function firstSentences(text: string, n: number): string {
  const parts = text
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？.!?])\s*/)
    .filter((s) => s.trim().length > 0);
  const joined = parts.slice(0, n).join("");
  return joined.slice(0, 180).trim();
}

/** 没有小标题的长文本（如逐字稿）：按位置切成 n 段，各取首句 */
function chunkSummary(text: string, maxPoints: number): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？.!?])\s*/)
    .filter((s) => s.trim().length > 8);
  if (sentences.length === 0) return [];

  const total = sentences.reduce((n, s) => n + s.length, 0);
  const step = Math.max(200, Math.ceil(total / maxPoints));
  const out: string[] = [];
  let pos = 0;
  let next = 0;

  for (const s of sentences) {
    if (pos >= next) {
      out.push(s.trim().slice(0, 150));
      next += step;
      if (out.length >= maxPoints) break;
    }
    pos += s.length;
  }
  return out;
}

export function summarizeMarkdown(raw: string, maxPoints = 8): string {
  // 去掉图片与链接语法，只留文字
  const md = raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  const lines = md.split("\n");
  const points: string[] = [];
  let heading = "";
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join(" ").trim();
    buffer = [];
    if (!text) return;
    const sentence = firstSentences(text, 2);
    if (!sentence) return;
    points.push(heading ? `${heading}：${sentence}` : sentence);
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      flush();
      heading = line.replace(/^#{1,6}\s*/, "").slice(0, 40);
      continue;
    }
    if (/^[>|]/.test(line) || /^[-*]\s/.test(line)) continue; // 引用 / 表格 / 列表跳过
    if (/^!\[/.test(line) || /^```/.test(line)) continue;
    buffer.push(line);
  }
  flush();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of points) {
    const key = p.slice(0, 24);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p.length > 140 ? `${p.slice(0, 140)}…` : p);
    if (out.length >= maxPoints) break;
  }

  if (out.length < 3) {
    const fallback = chunkSummary(md, maxPoints);
    if (fallback.length > 0) return fallback.map((p) => `- ${p}`).join("\n");
  }

  return ["## 分章要点", ...out.map((p) => `- ${p}`)].join("\n");
}
