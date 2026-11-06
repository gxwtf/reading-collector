"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { savePrefs } from "@/actions/prefs";

export function PreciseVideoToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(async () => {
            const fd = new FormData();
            if (next) fd.set("preciseVideo", "on");
            const res = await savePrefs({ ok: false }, fd);
            setMsg(res.message ?? "");
          });
        }}
        className="mt-1 size-4 accent-[var(--primary)]"
      />
      <span>
        <span className="flex items-center gap-2 text-sm font-medium">
          精确播放（B 站本地转码）
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          开启后视频页可「准备视频」，服务端把 B 站音视频合并成本地 mp4（首次需几分钟、占磁盘）。
          这样才能做到暂停即停滚动、拖动即跳、逐字精确。默认关闭。
        </span>
        {msg ? <span className="mt-1 block text-xs text-muted-foreground">{msg}</span> : null}
      </span>
    </label>
  );
}
