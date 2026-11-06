// 定时检查 RSS 订阅：由 worker 每 30 分钟调用一次（Bearer INTERNAL_API_KEY）
import type { NextRequest } from "next/server";
import { verifyWorkerRequest } from "@/lib/session";
import { checkFeed, dueFeeds } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyWorkerRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const due = await dueFeeds(5);
  const results: { id: number; ok: boolean; added?: number; error?: string }[] = [];

  for (const feed of due) {
    try {
      const r = await checkFeed(feed.id);
      results.push({ id: feed.id, ok: true, added: r.added });
    } catch (error) {
      results.push({ id: feed.id, ok: false, error: (error as Error).message.slice(0, 120) });
    }
  }

  return Response.json({ checked: due.length, results });
}
