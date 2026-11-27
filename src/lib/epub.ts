// 解析 epub：epub 本质是 zip，用 jszip 解包，章节 XHTML 用 turndown 转 Markdown。
// 只做同步解析，不依赖 worker（文件已在本机）。
import JSZip from "jszip";
import TurndownService from "turndown";

export type ParsedEpub = {
  title: string;
  author: string | null;
  markdown: string;
};

const INVALID = "不是有效的 epub 文件";

/** 解 XML/HTML 实体（只处理常见的几个，够用） */
function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** 去掉标签，留纯文本 */
function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** 取某个标签（可带属性）的内容 */
function tagContent(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  const text = stripTags(m[1]);
  return text || null;
}

/** 取标签里某个属性的值 */
function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? "");
}

/** OPF 里的 href 相对 OPF 所在目录，剥掉 #fragment 后拼接 */
function resolveHref(opfPath: string, href: string): string {
  const clean = href.split("#")[0].split("?")[0];
  const dir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";
  const joined = dir ? `${dir}/${clean}` : clean;
  // 手写 posix 归一化：处理 ./ 与 ../
  const parts: string[] = [];
  for (const seg of joined.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });
  // epub 里的图片在 zip 内部，导出的 Markdown 无法引用，直接丢掉，避免一堆坏图
  td.addRule("dropImages", {
    filter: "img",
    replacement: () => "",
  });
  return td;
}

/** 去掉 head / script / style，否则 <title> 会被 turndown 当成正文 */
function stripNonContent(html: string): string {
  return html
    .replace(/<head\b[\s\S]*?<\/head>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
}

/** 从章节 HTML 里取第一个 h1/h2 当章节标题，并从正文里移除它（避免重复） */
function extractHeading(html: string): { heading: string | null; body: string } {
  const re = /<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/i;
  const m = html.match(re);
  if (!m) return { heading: null, body: html };
  const heading = stripTags(m[2]).slice(0, 120);
  const body = html.replace(re, "");
  return { heading: heading || null, body };
}

export async function parseEpub(data: ArrayBuffer): Promise<ParsedEpub> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error(INVALID);
  }

  // 1. container.xml → OPF 路径
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error(INVALID);
  const container = await containerFile.async("string");
  const rootfileTag = container.match(/<rootfile\b[^>]*>/i)?.[0] ?? "";
  const opfPath = attr(rootfileTag, "full-path");
  if (!opfPath) throw new Error(INVALID);

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(INVALID);
  const opf = await opfFile.async("string");

  // 2. 元数据
  const title =
    tagContent(opf, "dc:title") ?? tagContent(opf, "title") ?? "未命名 epub";
  const author = tagContent(opf, "dc:creator") ?? tagContent(opf, "creator");

  // 3. manifest：id → href
  const manifest = new Map<string, string>();
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const tag = m[0];
    const id = attr(tag, "id");
    const href = attr(tag, "href");
    if (id && href) manifest.set(id, href);
  }

  // 4. spine：按顺序取 idref
  const spineBlock = opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i)?.[1] ?? "";
  const idrefs = Array.from(spineBlock.matchAll(/<itemref\b[^>]*>/gi))
    .map((m: unknown) => attr((m as RegExpMatchArray)[0], "idref"))
    .filter((id): id is string => Boolean(id));

  if (idrefs.length === 0) throw new Error(INVALID);

  // 5. 逐章转 Markdown
  const td = createTurndown();
  const chapters: string[] = [];
  for (const idref of idrefs) {
    const href = manifest.get(idref);
    if (!href) continue;
    const file = zip.file(resolveHref(opfPath, href));
    if (!file) continue;
    try {
      const html = stripNonContent(await file.async("string"));
      const { heading, body } = extractHeading(html);
      const md = td.turndown(body).replace(/\n{3,}/g, "\n\n").trim();
      if (!md) continue;
      chapters.push(heading ? `## ${heading}\n\n${md}` : md);
    } catch {
      // 单章失败跳过，不整本失败
      continue;
    }
  }

  if (chapters.length === 0) throw new Error(INVALID);

  return {
    title: title.slice(0, 200),
    author: author ? author.slice(0, 200) : null,
    markdown: chapters.join("\n\n---\n\n"),
  };
}
