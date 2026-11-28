import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
/**
 * 本地 PDF 文件的解析与落盘。
 *
 * 两件事必须分开看：
 * 1. **原文件落盘**——详情页靠它原样查看（`<object>` 嵌浏览器自带阅读器）。
 *    落盘失败就等于这个功能没了，所以它失败要抛错。
 * 2. **抽文字**——失败不该让整条导入失败。扫描件抽不出文字很常见，
 *    但原文件仍然值得收藏（能原样看），只是搜索/划线/AI 概括用不上。
 *
 * 为什么用 pdfjs-dist 而不是 pdf-parse：前者是 Mozilla 的官方实现，
 * 也是 Chrome 内置 PDF 阅读器的引擎；pdf-parse 是它的薄封装，多一层依赖
 * 却没有任何额外能力。`legacy/build` 是不依赖 DOM/Worker 的版本，Node 里能跑。
 */

export const MAX_PDF_BYTES = 50 * 1024 * 1024;

/** PDF 原文件目录，与 worker 用的保持同一个环境变量 */
export const PDF_DIR = process.env.PDF_DIR || "/home/gxwtf/reading-pdfs";

/** PDF 文件头。不信任前端给的 Content-Type / 扩展名——按字节判断。 */
export function isPdf(bytes: Uint8Array): boolean {
  // %PDF-
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export type ExtractResult = { ok: true; text: string; pages: number } | { ok: false; error: string };

/** pdfjs 的文档对象。只用到这几个方法，不引它的完整类型（类型定义很重且不稳定） */
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
    cleanup: () => void;
  }>;
};

/**
 * 抽取文字。永远不抛错——调用方拿到 `ok: false` 就跳过文字部分。
 *
 * 页数上限 300：再厚的 PDF 抽起来会卡住请求，而且这个库的定位是「稍后再看」，
 * 不是整本书的阅读器。
 *
 * ⚠️ **worker 必须走「主线程内联」这条路**。pdfjs 在 Node 下默认
 * `#isWorkerDisabled = true`，会退到 fake worker；但 fake worker 的加载器是
 * `await import(GlobalWorkerOptions.workerSrc)`，而 workerSrc 默认是相对路径
 * `"./pdf.worker.mjs"`。Next 的 webpack 打包后模块位置变了，这个相对路径解析不到，
 * 报 `Setting up fake worker failed: Cannot find module '.../pdf.worker.mjs'`。
 *
 * 解法：pdfjs 的 `_setupFakeWorkerGlobal` 会先看
 * `globalThis.pdfjsWorker?.WorkerMessageHandler`，有就直接用，根本不碰文件系统。
 * 所以先把 worker 模块导入并挂到这个全局上。
 */
let workerReady: Promise<void> | null = null;

async function ensureInlineWorker(): Promise<void> {
  const g = globalThis as { pdfjsWorker?: unknown };
  if (g.pdfjsWorker) return;
  // 只初始化一次：并发请求时避免重复 import
  workerReady ??= (async () => {
    // 这个 .mjs 没有类型声明（它本来是给 Worker 线程用的入口），
    // 这里只把它当「有 WorkerMessageHandler 的对象」用，不关心其余导出。
    const worker = await import(
      // @ts-expect-error 包内没有这个子路径的 .d.ts
      "pdfjs-dist/legacy/build/pdf.worker.mjs"
    );
    g.pdfjsWorker = worker;
  })();
  await workerReady;
}

export async function extractPdfText(bytes: Uint8Array): Promise<ExtractResult> {
  let task: { destroy: () => Promise<void> } | null = null;
  try {
    await ensureInlineWorker();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { getDocument } = pdfjs;

    task = getDocument({
      // 传副本：pdfjs 会转移（transfer）底层 buffer，之后原数组就废了，
      // 而调用方还要拿它写文件。
      data: new Uint8Array(bytes),
      useSystemFonts: true,
      // 不加载字体：服务端只抽文字，不做渲染
      disableFontFace: true,
    }) as unknown as { destroy: () => Promise<void>; promise: Promise<PdfDoc> };

    const doc = await (task as unknown as { promise: Promise<PdfDoc> }).promise;

    const pages = Math.min(doc.numPages, 300);
    const chunks: string[] = [];
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/[ \t]+/g, " ")
        .trim();
      if (line) chunks.push(line);
      page.cleanup();
    }

    const text = chunks.join("\n\n").trim();
    if (text.length < 120) {
      return { ok: false, error: "PDF 里抽不到文字（可能是扫描件）" };
    }
    return { ok: true, text, pages };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `PDF 解析失败：${msg.slice(0, 200)}` };
  } finally {
    // 用 loading task 的 destroy：它会连 worker/transport 一起回收。
    // PDFDocumentProxy 上的 destroy 是内部用的，节点环境里不保证能调。
    await task?.destroy().catch(() => undefined);
  }
}

/**
 * 正文要塞进 MDX 渲染。PDF 里常有 `<pad>`、`<EOS>`、`<unk>` 这种尖括号记号，
 * MDX 会把它们当 JSX 标签解析，编译期抛「Expected a closing tag」，整个详情页 500。
 * 只转 `<` `>`，不动 `&`——再转一次会把 `&amp;` 变成可见的 `&amp;amp;`。
 */
export function escapeMdxAngles(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 把原文件写到 PDF_DIR/<sha256 前 32>.pdf，返回绝对路径 */
export async function savePdfFile(bytes: Uint8Array): Promise<string> {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  await mkdir(PDF_DIR, { recursive: true });
  const abs = path.join(PDF_DIR, `${hash}.pdf`);
  await writeFile(abs, bytes);
  return abs;
}

/** 从文件名里取一个像样的标题 */
export function titleFromFilename(name: string): string {
  return (
    name
      .replace(/\.pdf$/i, "")
      .replace(/[_]+/g, " ")
      .trim()
      .slice(0, 200) || "PDF 文档"
  );
}
