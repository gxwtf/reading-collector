// OPML 导入：批量创建 RSS 订阅
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "没有收到 OPML 文件" }, { status: 400 });

  const text = await file.text();
  const feeds = [...text.matchAll(/<outline[^>]*xmlUrl="([^"]+)"[^>]*?/g)].map((m) => {
    const block = m[0];
    const title = block.match(/title="([^"]*)"/)?.[1] ?? block.match(/text="([^"]*)"/)?.[1] ?? "";
    return { url: m[1], title };
  });

  let added = 0;
  for (const feed of feeds.slice(0, 200)) {
    const exists = await prisma.feed.findFirst({
      where: { userId: session.userId, url: feed.url },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.feed.create({
      data: { userId: session.userId, url: feed.url, title: feed.title.slice(0, 100) || null },
    });
    added += 1;
  }

  return Response.json({ ok: true, added, total: feeds.length });
}
