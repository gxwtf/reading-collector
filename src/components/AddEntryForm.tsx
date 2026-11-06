"use client";

import { useActionState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { createEntries, type CreateEntryState } from "@/actions/entries";
import { Button } from "@/components/ui/button";

type CollectionOption = { id: number; name: string };

const initialState: CreateEntryState = { ok: false };

export function AddEntryForm({ collections }: { collections: CollectionOption[] }) {
  const [state, action, pending] = useActionState(createEntries, initialState);

  return (
    <form action={action} className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <textarea
        name="urls"
        required
        rows={2}
        placeholder={"一行一个链接，可以一次贴很多条：\nhttps://mp.weixin.qq.com/s/…\nhttps://www.bilibili.com/video/BV…"}
        className="w-full resize-y appearance-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          name="tags"
          placeholder="标签，逗号分隔（可选）"
          className="h-8 flex-1 appearance-none rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <select
          name="collectionId"
          defaultValue=""
          className="h-8 appearance-none rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-40"
        >
          <option value="">不放进分组</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={pending} className="sm:w-28">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />}
          批量收藏
        </Button>
      </div>

      {state.error ? (
        <p className="mt-2 text-sm text-destructive">{state.error}</p>
      ) : state.ok ? (
        <p className="mt-2 text-xs text-muted-foreground">
          已加入 {state.added} 条{state.skipped ? `，跳过重复 ${state.skipped} 条` : ""}。抓取在后台进行。
        </p>
      ) : null}
    </form>
  );
}
