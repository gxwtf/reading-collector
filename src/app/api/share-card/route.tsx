import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import QRCode from "qrcode";
import { kindLabel } from "@/lib/kind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 分享小图（《稍后再看》设计说明 §4.6）。
 *
 * 固定 1080×1080，四段纵向分布（两端对齐）：
 *   1. 顶：左「类型 · 来源」（陶土），右品牌名（衬线）
 *   2. 主标题：衬线 72px，最多三行
 *   3. 引用区：左侧 6px 陶土竖条 + 金句 + 出处
 *   4. 底：gxwtf.cn / 二维码
 *
 * 与旧版的差别：旧版是 1080×1440 的「微信读书卡片」，两种版式（article / quote）。
 * 新设计只有一套 1:1 的版式，两个入口都走它。旧参数仍接受，只是不再分叉，
 * 免得 ShareCardDialog 那边还要改。
 *
 * 注意：ImageResponse 不认 CSS 变量，也不认 Tailwind，颜色必须写字面值。
 * 这里的值与 globals.css 的 :root 保持一致，改动时要一起改。
 */

const FONT_SERIF =
  process.env.SHARE_FONT_SERIF || "/home/gxwtf/.fonts/NotoSerifSC-Regular.otf";
/**
 * 候选字体，按顺序取第一个存在的。
 *
 * **只能放单字体文件（.otf / .ttf），不能放 .ttc**：satori 只认单一字体，
 * 遇到 TTC 集合会抛 `Unsupported OpenType signature ttcf`，整张图 500。
 * Windows 的 simsun.ttc / msyh.ttc 都属于这一类，别往这里加。
 */
const FONT_FALLBACK = [
  process.env.QUOTE_FONT || "/home/gxwtf/.fonts/simsun.ttf",
  "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.otf",
  "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
];

const cache = new Map<string, ArrayBuffer>();

async function loadFont(): Promise<ArrayBuffer> {
  for (const p of [FONT_SERIF, ...FONT_FALLBACK]) {
    if (!p || !existsSync(p)) continue;
    const hit = cache.get(p);
    if (hit) return hit;
    const buf = await readFile(p);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    cache.set(p, ab);
    return ab;
  }
  throw new Error("找不到中文字体");
}

/** 设计说明 §3.1 的纸张配色；深色用 §9 建议的那套 */
const THEME = {
  light: { bg: "#FAF9F5", surface: "#FFFFFF", text: "#141413", text2: "#5E5D57", text3: "#6E6A61", accent: "#B4552F", rule: "#D97757" },
  dark: { bg: "#1F1E1D", surface: "#262524", text: "#FAF9F5", text2: "#B9B5AA", text3: "#9A968C", accent: "#E58A69", rule: "#D97757" },
} as const;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const kind = q.get("kind") ?? "article";
  const title = (q.get("title") ?? "").trim().slice(0, 80);
  const text = (q.get("text") ?? "").trim().slice(0, 320);
  const site = (q.get("site") ?? "").trim().slice(0, 40);
  const url = (q.get("url") ?? "").trim().slice(0, 300);
  const theme = q.get("theme") === "dark" ? THEME.dark : THEME.light;

  if (!text && !title) return new Response("缺少内容", { status: 400 });

  const font = await loadFont();

  const qr = url
    ? await QRCode.toDataURL(url, {
        margin: 0,
        width: 264,
        errorCorrectionLevel: "M",
        color: { dark: theme.text, light: "#00000000" },
      }).catch(() => "")
    : "";

  // 标题越长字号越小，保证最多三行放得下（1080 - 88*2 = 904px 可用宽）
  const titleSize = title.length > 46 ? 54 : title.length > 30 ? 62 : 72;
  // 金句同理
  const quoteSize = text.length > 90 ? 26 : text.length > 55 ? 29 : 32;

  const body = (
    <div
      style={{
        width: 1080,
        height: 1080,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: theme.bg,
        padding: 88,
        fontFamily: "Share",
      }}
    >
      {/* 1. 顶部：类别与来源 / 品牌名 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ display: "flex", fontSize: 24, color: theme.accent }}>
          {[kindLabel(kind), site].filter(Boolean).join(" · ")}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: theme.text3 }}>稍后再看</div>
      </div>

      {/* 2. 主标题 */}
      <div
        style={{
          display: "flex",
          fontSize: titleSize,
          lineHeight: 1.25,
          color: theme.text,
          // ImageResponse 支持 -webkit-line-clamp 的部分实现；这里靠限字数兜底
          overflow: "hidden",
        }}
      >
        {title || "未命名"}
      </div>

      {/* 3. 引用区：左侧 6px 陶土竖条（§4.6 明确这是全站唯一允许的左侧彩条） */}
      <div style={{ display: "flex", gap: 28 }}>
        <div style={{ display: "flex", width: 6, background: theme.rule, borderRadius: 3 }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 18 }}>
          {text ? (
            <div style={{ display: "flex", fontSize: quoteSize, lineHeight: 1.6, color: theme.text }}>
              {text}
            </div>
          ) : null}
          <div style={{ display: "flex", fontSize: 24, color: theme.text3 }}>
            {site ? `AI 概括 · ${site}` : "AI 概括"}
          </div>
        </div>
      </div>

      {/* 4. 底部：域名 / 二维码 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", fontSize: 22, color: theme.text3 }}>gxwtf.cn</div>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} width={132} height={132} alt="" />
        ) : (
          <div
            style={{
              display: "flex",
              width: 132,
              height: 132,
              border: `1px dashed ${theme.text3}`,
              borderRadius: 8,
            }}
          />
        )}
      </div>
    </div>
  );

  return new ImageResponse(body, {
    width: 1080,
    height: 1080,
    fonts: [{ name: "Share", data: font, style: "normal", weight: 400 }],
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
