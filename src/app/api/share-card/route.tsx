import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 分享图（统一入口，带二维码）：
 *   /api/share-card?kind=article&title=…&text=…&site=…&url=…
 *   /api/share-card?kind=quote&title=…&text=…&site=…&url=…
 * 二维码指向分享短链，扫码即可在手机上打开原文/该书划线。
 */

const FONTS: Record<string, string> = {
  song: process.env.QUOTE_FONT || "/home/gxwtf/.fonts/simsun.ttf",
  kai: process.env.QUOTE_FONT_KAI || "/home/gxwtf/.fonts/LXGWWenKai-Regular.ttf",
  yuan: "/home/gxwtf/gxwtf_ji/public/fonts/lingxiu.ttf",
  hei: "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
};

const cache = new Map<string, ArrayBuffer>();

async function loadFont(key: string): Promise<ArrayBuffer> {
  const paths = [FONTS[key] ?? FONTS.song, FONTS.song];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const hit = cache.get(p);
    if (hit) return hit;
    const buf = await readFile(p);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    cache.set(p, ab);
    return ab;
  }
  throw new Error("找不到中文字体");
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const kind = q.get("kind") === "article" ? "article" : "quote";
  const text = (q.get("text") ?? "").trim().slice(0, 420);
  const title = (q.get("title") ?? "").trim().slice(0, 60);
  const site = (q.get("site") ?? "").trim().slice(0, 20);
  const url = (q.get("url") ?? "").trim().slice(0, 300);
  const theme = q.get("theme") === "dark" ? "dark" : "light";
  const fontKey = q.get("font") ?? "song";

  if (!text && !title) return new Response("缺少内容", { status: 400 });

  const font = await loadFont(fontKey);

  const dark = theme === "dark";
  const bg = dark ? "#14100f" : "#f7f3ec";
  const fg = dark ? "#f5efe6" : "#231815";
  const muted = dark ? "#9d938a" : "#8a7f78";
  const accent = dark ? "#e0574f" : "#a31f24";

  // 二维码：透明底，前景随主题
  const qr = url
    ? await QRCode.toDataURL(url, {
        margin: 1,
        width: 360,
        errorCorrectionLevel: "M",
        color: { dark: fg, light: "#00000000" },
      }).catch(() => "")
    : "";

  const header = (label: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex", width: 46, height: 46, borderRadius: 12, background: accent }} />
      <div style={{ display: "flex", fontSize: 30, color: muted, letterSpacing: 2 }}>{label}</div>
    </div>
  );

  const footer = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", height: 1, background: muted, opacity: 0.35 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {title && kind === "quote" ? (
            <div style={{ display: "flex", fontSize: 30, color: fg, opacity: 0.9 }}>{`《${title}》`}</div>
          ) : null}
          <div style={{ display: "flex", fontSize: 24, color: muted }}>
            {site || "reading.gxwtf.cn"} · 广学五题坊
          </div>
        </div>
        {qr ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} width={150} height={150} alt="" />
            <div style={{ display: "flex", fontSize: 20, color: muted }}>扫码阅读</div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const body =
    kind === "article" ? (
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
        {header("阅读收集")}

        <div
          style={{
            display: "flex",
            marginTop: 72,
            fontSize: title.length > 18 ? 66 : 78,
            lineHeight: 1.35,
            color: fg,
            fontWeight: 400,
          }}
        >
          {title || "未命名"}
        </div>

        <div style={{ display: "flex", marginTop: 40, width: 120, height: 6, background: accent, opacity: 0.85 }} />

        <div
          style={{
            display: "flex",
            marginTop: 40,
            flexGrow: 1,
            fontSize: 34,
            lineHeight: 1.85,
            color: muted,
          }}
        >
          {text}
        </div>

        {footer}
      </div>
    ) : (
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
        {header("金句")}
        <div style={{ display: "flex", marginTop: 60, fontSize: 110, lineHeight: 1, color: accent, opacity: 0.35 }}>
          {"\u201C"}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 0,
            flexGrow: 1,
            fontSize: text.length <= 30 ? 76 : text.length <= 60 ? 64 : 52,
            lineHeight: 1.7,
            letterSpacing: 1,
            color: fg,
          }}
        >
          {text}
        </div>
        {footer}
      </div>
    );

  return new ImageResponse(body, {
    width: 1080,
    height: 1440,
    fonts: [{ name: "Quote", data: font, style: "normal", weight: 400 }],
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
