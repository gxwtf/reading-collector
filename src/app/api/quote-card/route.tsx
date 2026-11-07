import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 金句分享图：1080×1440，微信读书那种卡片。
 * GET /api/quote-card?text=...&title=...&site=...&theme=light|dark
 */

const FONT_CANDIDATES = [
  process.env.QUOTE_FONT,
  "/home/gxwtf/.fonts/simsun.ttf",
  "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
].filter(Boolean) as string[];

let fontCache: ArrayBuffer | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (fontCache) return fontCache;
  for (const path of FONT_CANDIDATES) {
    if (existsSync(path)) {
      const buf = await readFile(path);
      fontCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      return fontCache;
    }
  }
  throw new Error("找不到中文字体，请设置 QUOTE_FONT");
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const text = (params.get("text") ?? "").trim().slice(0, 300);
  const title = (params.get("title") ?? "").trim().slice(0, 60);
  const site = (params.get("site") ?? "").trim().slice(0, 20);
  const theme = params.get("theme") === "dark" ? "dark" : "light";

  if (!text) return new Response("缺少 text 参数", { status: 400 });

  const font = await loadFont();

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
          fontFamily: "Songti",
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
            marginTop: 4,
            flexGrow: 1,
            fontSize: size,
            lineHeight: 1.62,
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
      fonts: [{ name: "Songti", data: font, style: "normal", weight: 400 }],
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
