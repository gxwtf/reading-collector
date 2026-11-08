"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function RegenerateButton({ action }: { action: () => Promise<void> }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const router = useRouter();

  const run = () => {
    setState("idle");
    start(async () => {
      try {
        await action();
        router.refresh();
        setState("done");
        setTimeout(() => setState("idle"), 4000);
      } catch {
        setState("error");
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
        {pending ? "重算中…" : "重算"}
      </button>

      {pending ? (
        <Alert>
          <AlertTitle>正在重新生成概括</AlertTitle>
          <AlertDescription>通常 10–30 秒；完成后本页会自动刷新。</AlertDescription>
        </Alert>
      ) : null}

      {state === "done" ? (
        <Alert variant="success">
          <AlertTitle className="flex items-center gap-1">
            <Check className="size-3" />
            概括已更新
          </AlertTitle>
        </Alert>
      ) : null}

      {state === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>重算失败</AlertTitle>
          <AlertDescription>稍后再试，或到设置里检查模型 key。</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
