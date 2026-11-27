"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Props = {
  pending: number;
  running: number;
  ready: number;
  failed: number;
};

/** 有任务在跑时每 4 秒刷新一次服务端数据，让进度自己往前走 */
export function FetchProgress({ pending, running, ready, failed }: Props) {
  const router = useRouter();
  const active = pending + running;

  useEffect(() => {
    if (active <= 0) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [active, router]);

  if (active <= 0) return null;

  const total = active + ready + failed;
  const done = ready + failed;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-hairline px-4 py-3">
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <Loader2 className="size-3.5 animate-spin text-brand-strong" />
        <span>
          后台处理中：排队 {pending} · 抓取 {running} · 已完成 {done}/{total}
        </span>
        <span className="ml-auto tabular-nums text-ink-3">{pct}%</span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-paper-muted">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {failed > 0 ? (
        <p className="mt-1.5 text-[12px] text-ink-3">其中 {failed} 条抓取失败，可在详情页重试。</p>
      ) : null}
    </div>
  );
}
