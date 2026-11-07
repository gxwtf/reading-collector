import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 金句分享图：1080×1440，微信读书那种卡片。
 * GET /api/quote-card?text=...&title=...&site=...&theme=light|dark
 */

const FONTS: Record<string, { path: string; label: string }> = {
  song: { path: process.env.QUOTE_FONT || "/home/gxwtf/.fonts/simsun.ttf", label: "宋体" },
  kai: { path: process.env.QUOTE_FONT_KAI || "/home/gxwtf/.fonts/LXGWWenKai-Regular.ttf", label: "楷体" },
  yuan: { path: "/home/gxwtf/gxwtf_ji/public/fonts/lingxiu.ttf", label: "圆体" },
  hei: { path: "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf", label: "黑体" },
};

const cache = new Map<string, ArrayBuffer>();

async function loadFont(key: string): Promise<{ data: ArrayBuffer; name: string }> {
  const chosen = FONTS[key] ?? FONTS.song;
  const fallback = FONTS.song;

  for (const candidate of [chosen.path, fallback.path]) {
    if (!existsSync(candidate)) continue;
    const hit = cache.get(candidate);
    if (hit) return { data: hit, name: chosen.label };
    const buf = await readFile(candidate);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    cache.set(candidate, ab);
    return { data: ab, name: chosen.label };
  }
  throw new Error("找不到中文字体，请设置 QUOTE_FONT");
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawText = (params.get("text") ?? "").trim().slice(0, 300);
  // 去掉原文自带的引号，避免和卡片上的装饰引号重复
  const text = rawText.replace(/^[\u201C\u201D"']+/, "").replace(/[\u201C\u201D"']+$/, "").trim();
  const title = (params.get("title") ?? "").trim().slice(0, 60);
  const site = (params.get("site") ?? "").trim().slice(0, 20);
  const theme = params.get("theme") === "dark" ? "dark" : "light";

  if (!text) return new Response("缺少 text 参数", { status: 400 });

  const fontKey = params.get("font") ?? "song";
  const font = await loadFont(fontKey);

  const dark = theme === "dark";
  const bg = dark ? "#14100f" : "#f7f3ec";
  const fg = dark ? "#f5efe6" : "#231815";
  const muted = dark ? "#9d938a" : "#8a7f78";
  const accent = dark ? "#e0574f" : "#a31f24";

  // 文字越长字号越小
  const size = text.length <= 30 ? 76 : text.length <= 60 ? 64 : text.length <= 110 ? 52 : text.length <= 180 ? 42 : 34;

  const titleLine = title ? `《${title}》` : "";
  const footerRight = "广学五题坊 · 阅读收集";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1440,
          display: "flex",
          flexDirection: "column",
          background: bg,
          padding: "96px 88px",
          fontFamily: "Quote",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", width: 46, height: 46, borderRadius: 12, background: accent }} />
          <div style={{ display: "flex", fontSize: 30, color: muted, letterSpacing: 2 }}>{"阅读收集"}</div>
        </div>

        <div style={{ display: "flex", marginTop: 76, fontSize: 110, lineHeight: 1, color: accent, opacity: 0.35 }}>
          {"\u201C"}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 4,
            flexGrow: 1,
            fontSize: size,
            lineHeight: 1.7,
            letterSpacing: 1,
            color: fg,
          }}
        >
          {text}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", height: 1, background: muted, opacity: 0.35 }} />
          {titleLine ? (
            <div style={{ display: "flex", fontSize: 30, color: fg, opacity: 0.9 }}>{titleLine}</div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: muted }}>
            <div style={{ display: "flex" }}>{site || "reading.gxwtf.cn"}</div>
            <div style={{ display: "flex" }}>{footerRight}</div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1440,
      fonts: [{ name: "Quote", data: font.data, style: "normal", weight: 400 }],
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
