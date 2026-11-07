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

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1440,
          background: bg,
          display: "flex",
          flexDirection: "column",
          padding: "96px 88px",
          fontFamily: "Songti",
          position: "relative",
        }}
      >
        {/* 顶部品牌 */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: accent }} />
          <div style={{ fontSize: 30, color: muted, letterSpacing: 2 }}>阅读收集</div>
        </div>

        {/* 引号 */}
        <div style={{ marginTop: 84, fontSize: 120, lineHeight: 1, color: accent, opacity: 0.35 }}>“</div>

        {/* 正文 */}
        <div
          style={{
            marginTop: 8,
            fontSize: size,
            lineHeight: 1.62,
            color: fg,
            display: "flex",
            flexGrow: 1,
            letterSpacing: 1,
          }}
        >
          {text}
        </div>

        {/* 分隔线 + 来源 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ height: 1, background: muted, opacity: 0.35 }} />
          {title ? (
            <div style={{ fontSize: 30, color: fg, opacity: 0.9 }}>《{title}》</div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: muted }}>
            <div>{site || "reading.gxwtf.cn"}</div>
            <div>广学五题坊 · 阅读收集</div>
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
