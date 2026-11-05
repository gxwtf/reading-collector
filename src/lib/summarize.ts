/** 抽取式概括：不依赖大模型，取每节首句，最多 8 条要点 */

function firstSentences(text: string, n: number): string {
  const parts = text
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？.!?])\s*/)
    .filter((s) => s.trim().length > 0);
  const joined = parts.slice(0, n).join("");
  return joined.slice(0, 180).trim();
}

export function summarizeMarkdown(md: string, maxPoints = 8): string {
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

  return out.map((p) => `- ${p}`).join("\n");
}
