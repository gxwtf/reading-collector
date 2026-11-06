"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** 精确播放前准备本地 mp4：触发转码并轮询状态 */
export function PrepareVideo({ entryId, state }: { entryId: number; state: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(state);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "pending") return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/media/${entryId}/status`).then((r) => r.json());
      if (res.state !== "pending") {
        setStatus(res.state);
        clearInterval(timer);
        router.refresh();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [entryId, router, status]);

  async function start() {
    setBusy(true);
    try {
      await fetch(`/api/media/${entryId}/prepare`, { method: "POST" });
      setStatus("pending");
    } finally {
      setBusy(false);
    }
  }

  if (status === "ready") return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      {status === "pending" ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          <span>正在准备本地视频（首次约几分钟，可先看内嵌播放器）…</span>
        </>
      ) : (
        <>
          <span>
            {status === "failed" ? "上次准备失败，可重试。" : "开启精确播放后第一次需要准备本地视频。"}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={start}
            className="rounded-md border border-border px-2 py-0.5 hover:text-foreground"
          >
            准备视频
          </button>
        </>
      )}
    </div>
  );
}
