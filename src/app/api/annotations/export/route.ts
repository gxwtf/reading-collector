import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

/** 导出全部批注为 Markdown：一条划线 + 我的批注 + 出处 */
export async function GET() {
  const session = await getSession();
  if (!session.userId) return new Response("未登录", { status: 401 });

  const rows = await prisma.highlight.findMany({
    where: { userId: session.userId },
    orderBy: { id: "asc" },
    include: { entry: { select: { title: true, url: true, site: true } } },
  });

  const byEntry = new Map<number, typeof rows>();
  for (const h of rows) {
    const list = byEntry.get(h.entryId) ?? [];
    list.push(h);
    byEntry.set(h.entryId, list);
  }

  const lines: string[] = [`# 阅读收集 · 批注导出`, ``, `> 导出时间：${new Date().toLocaleString("zh-CN")}`, ``];
  for (const [, items] of byEntry) {
    const entry = items[0].entry;
    lines.push(`## ${entry.title}`, ``);
    if (entry.site) lines.push(`来源：${entry.site}　${entry.url}`, ``);
    for (const h of items) {
      lines.push(`> ${h.quote.replace(/\n/g, " ")}`, ``);
      if (h.note?.trim()) lines.push(`批注：${h.note.trim()}`, ``);
    }
  }

  const body = lines.join("\n");
  const name = `批注-${new Date().toISOString().slice(0, 10)}.md`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
