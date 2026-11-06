import Link from "next/link";
import { RefreshCw, Rss, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { refreshFeed, unsubscribeFeed } from "@/actions/feeds";

/** 首页的订阅列表：手动刷新 / 取消订阅 */
export async function FeedList() {
  const session = await requireSession("/");
  const feeds = await prisma.feed.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (feeds.length === 0) return null;

  return (
    <section className="rounded-xl bg-card ring-1 ring-foreground/10 p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <Rss className="size-4" />
        RSS 订阅（{feeds.length}）
      </h2>
      <ul className="mt-2 space-y-1.5">
        {feeds.map((feed) => (
          <li key={feed.id} className="flex items-center gap-2 text-sm">
            <Link href="/?q=RSS" className="min-w-0 flex-1 truncate hover:text-brand" title={feed.url}>
              {feed.title ?? feed.url}
            </Link>
            <span className="shrink-0 text-xs text-muted-foreground">
              {feed.lastCheckedAt ? feed.lastCheckedAt.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "未检查"}
              {feed.lastError ? " · 失败" : ""}
            </span>
            <form action={refreshFeed.bind(null, feed.id)}>
              <button type="submit" aria-label="立即刷新" className="text-muted-foreground hover:text-foreground">
                <RefreshCw className="size-3.5" />
              </button>
            </form>
            <form action={unsubscribeFeed.bind(null, feed.id)}>
              <button type="submit" aria-label="取消订阅" className="text-muted-foreground hover:text-destructive">
                <Trash2 className="size-3.5" />
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
