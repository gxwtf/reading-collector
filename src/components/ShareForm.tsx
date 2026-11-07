"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { createEntries, type CreateEntryState } from "@/actions/entries";
import { Button } from "@/components/ui/button";

const initial: CreateEntryState = { ok: false };

export function ShareForm({ url, title }: { url: string; title: string }) {
  const [state, action, pending] = useActionState(createEntries, initial);

  if (state.ok) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm">
          已加入 {state.added} 条{state.skipped ? `，跳过重复 ${state.skipped} 条` : ""}
        </p>
        <div className="flex justify-center gap-2">
          <Button asChild size="sm">
            <Link href="/">回到收藏</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={url} target="_blank" rel="noreferrer">
              看原文
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input
        name="urls"
        defaultValue={url}
        className="h-9 w-full appearance-none rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {title ? <p className="text-xs text-muted-foreground">{title}</p> : null}
      <input
        name="tags"
        placeholder="标签，逗号分隔（可选）"
        className="h-9 w-full appearance-none rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        收藏
      </Button>
    </form>
  );
}
