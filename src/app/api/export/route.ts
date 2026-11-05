// 导出选中的收藏：/api/export?ids=1,2,3&format=md|json
// 只导出当前登录用户自己的条目。
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function yaml(value: string | null | undefined) {
  if (!value) return '""';
  return JSON.stringify(value);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return new Response("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") || "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0)
    .slice(0, 200);

  if (ids.length === 0) return new Response("no ids", { status: 400 });

  const entries = await prisma.entry.findMany({
    where: { id: { in: ids }, userId: session.userId },
    orderBy: { createdAt: "asc" },
    include: { tags: { include: { tag: true } } },
  });

  if (entries.length === 0) return new Response("nothing to export", { status: 404 });

  const format = url.searchParams.get("format") === "json" ? "json" : "md";
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const payload = entries.map((e) => ({
      title: e.title,
      url: e.url,
      site: e.site,
      author: e.author,
      kind: e.kind,
      readState: e.readState,
      favorite: e.favorite,
      wordCount: e.wordCount,
      publishedAt: e.publishedAt,
      savedAt: e.createdAt,
      tags: e.tags.map((t) => t.tag.name),
      contentMd: e.contentMd,
    }));
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="reading-${stamp}.json"`,
      },
    });
  }

  // 单文件 Markdown 合集：每篇带 front-matter，可直接拖进 Obsidian
  const parts = entries.map((e) => {
    const tags = e.tags.map((t) => t.tag.name);
    const front = [
      "---",
      `title: ${yaml(e.title)}`,
      `url: ${yaml(e.url)}`,
      `site: ${yaml(e.site)}`,
      `author: ${yaml(e.author)}`,
      `kind: ${e.kind}`,
      `saved: ${formatDate(e.createdAt)}`,
      `tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]`,
      "---",
      "",
      `# ${e.title}`,
      "",
      `> 来源：${e.site ?? "—"}${e.author ? ` · ${e.author}` : ""} ｜ 原文：${e.url}`,
      "",
      e.contentMd ?? "_（正文未抓取）_",
      "",
    ].join("\n");
    return front;
  });

  const body = `# 阅读收集导出（${stamp}，${entries.length} 篇）\n\n${parts.join("\n\n---\n\n")}`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="reading-${stamp}.md"`,
    },
  });
}
