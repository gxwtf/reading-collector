"use client";

import { useActionState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { createEntry, type CreateEntryState } from "@/actions/entries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: CreateEntryState = { ok: false };

export function AddEntryForm() {
  const [state, action, pending] = useActionState(createEntry, initialState);

  return (
    <form action={action} className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="url"
          type="url"
          required
          placeholder="粘贴链接：https://mp.weixin.qq.com/s/…"
          className="flex-1"
        />
        <Button type="submit" disabled={pending} className="sm:w-24">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
          收藏
        </Button>
      </div>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input name="title" placeholder="标题（留空则抓取后自动填）" className="flex-1" />
        <Input name="tags" placeholder="标签，逗号分隔" className="sm:w-56" />
      </div>

      {state.error ? (
        <p className="mt-2 text-sm text-destructive">{state.error}</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          抓正文/转写在后台队列里跑，页面会自动刷新看到结果。
        </p>
      )}
    </form>
  );
}
