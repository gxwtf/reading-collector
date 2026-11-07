import type { Metadata } from "next";
import { BookOpenText } from "lucide-react";
import { ShareForm } from "@/components/ShareForm";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "收藏到阅读收集" };

type Search = Promise<{ url?: string; text?: string; title?: string }>;

function pickUrl(raw?: string) {
  if (!raw) return "";
  const m = raw.match(/https?:\/\/[^\s<>"）)】，。]+/);
  return m ? m[0].replace(/[.,;:!?]+$/, "") : "";
}

/** PWA share target：从系统分享面板接收链接 */
export default async function SharePage({ searchParams }: { searchParams: Search }) {
  await requireSession("/share");
  const sp = await searchParams;
  const url = pickUrl(sp.url) || pickUrl(sp.text);
  const title = (sp.title ?? "").slice(0, 120);

  return (
    <div className="mx-auto max-w-md space-y-5 py-8">
      <div className="flex items-center gap-2">
        <BookOpenText className="size-5 text-brand" />
        <h1 className="text-lg font-semibold">收藏到阅读收集</h1>
      </div>

      {url ? (
        <ShareForm url={url} title={title} />
      ) : (
        <p className="text-sm text-muted-foreground">
          分享内容里没有找到链接。回到列表手动粘贴试试。
        </p>
      )}
    </div>
  );
}
