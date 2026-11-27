// 文本类导入（Markdown / epub）共用的入库逻辑：直接入库，不走抓取。
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { summarizeMarkdown } from "@/lib/summarize";

function titleOf(markdown: string, fallback: string) {
  const heading = markdown.match(/^\s*#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 200);
  const firstLine = markdown.split("\n").find((l) => l.trim())?.trim() ?? "";
  return (firstLine || fallback).slice(0, 200);
}

export type SaveTextOptions = {
  /** 没有标题时的兜底（一般是文件名） */
  fallbackTitle: string;
  /** 来源站名，如 Markdown / EPUB */
  site: string;
  /** url 前缀，如 markdown / epub，最终 url 为 `<prefix>:<sha256前32>` */
  urlPrefix: string;
  author?: string | null;
  /** 明确指定的标题（如 epub 的书名），优先于从正文推断 */
  title?: string | null;
  /** 投进哪个分组；调用方必须先用 ensureCollection 校验归属 */
  collectionId?: number | null;
};

/** 入库一条文本条目；内容太短或已存在（同 userId + urlHash）返回 false */
export async function saveTextEntry(
  userId: number,
  markdown: string,
  opts: SaveTextOptions,
): Promise<boolean> {
  const body = markdown.trim();
  if (body.length < 20) return false;

  const title = (opts.title?.trim() || titleOf(body, opts.fallbackTitle)).slice(0, 200);
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 32);
  const url = `${opts.urlPrefix}:${hash}`;

  const existing = await prisma.entry.findFirst({
    where: { userId, urlHash: hash },
    select: { id: true },
  });
  if (existing) {
    // 重复导入不新建条目，但仍要放进分组——否则「拖进某个分组」看起来没反应
    if (opts.collectionId) {
      await prisma.collectionEntry.upsert({
        where: { collectionId_entryId: { collectionId: opts.collectionId, entryId: existing.id } },
        update: {},
        create: { collectionId: opts.collectionId, entryId: existing.id },
      });
    }
    return false;
  }

  const plain = body.replace(/[#>*`[\]()!-]/g, "");

  const created = await prisma.entry.create({
    data: {
      userId,
      url,
      urlHash: hash,
      title,
      site: opts.site,
      author: opts.author ?? null,
      kind: "article",
      state: "ready",
      contentMd: body,
      summary: summarizeMarkdown(body),
      excerpt: plain.replace(/\s+/g, " ").slice(0, 160),
      wordCount: plain.replace(/\s+/g, "").length,
    },
    select: { id: true },
  });

  if (opts.collectionId) {
    await prisma.collectionEntry.upsert({
      where: { collectionId_entryId: { collectionId: opts.collectionId, entryId: created.id } },
      update: {},
      create: { collectionId: opts.collectionId, entryId: created.id },
    });
  }
  return true;
}
