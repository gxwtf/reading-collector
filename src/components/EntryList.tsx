"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Download, FolderMinus, FolderPlus, Trash2, Undo2, X } from "lucide-react";
import { EntryCard, type EntryCardData } from "@/components/EntryCard";
import {
  bulkAddToCollection,
  bulkDelete,
  bulkRemoveFromCollection,
  bulkSetReadState,
} from "@/actions/entries";

type CollectionOption = { id: number; name: string };

export function EntryList({
  entries,
  collections,
  activeCollectionId,
}: {
  entries: EntryCardData[];
  collections: CollectionOption[];
  activeCollectionId?: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const allSelected = entries.length > 0 && selected.size === entries.length;
  const ids = useMemo(() => Array.from(selected), [selected]);

  function toggle(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(entries.map((e) => e.id)) : new Set());
  }

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      setSelected(new Set());
      router.refresh();
    });
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        这里还没有内容。把想读的链接贴到上面，抓取会在后台完成。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => toggleAll(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          全选
        </label>
        {selected.size > 0 ? <span>已选 {selected.size} 条</span> : null}
      </div>

      <ul className="grid gap-3 2xl:grid-cols-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            <EntryCard
              entry={entry}
              selectable
              selected={selected.has(entry.id)}
              onToggle={toggle}
            />
          </li>
        ))}
      </ul>

      {selected.size > 0 ? (
        <div className="sticky bottom-4 z-20 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">已选 {selected.size} 条</span>

            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => bulkSetReadState(ids, "done"))}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" />
              标记已读
            </button>

            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => bulkSetReadState(ids, "unread"))}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Undo2 className="size-3.5" />
              标记未读
            </button>

            {collections.length > 0 ? (
              <>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">选择分组…</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={pending || !target}
                  onClick={() => run(() => bulkAddToCollection(ids, Number(target)))}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <FolderPlus className="size-3.5" />
                  加入
                </button>

                {activeCollectionId ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => bulkRemoveFromCollection(ids, activeCollectionId))}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <FolderMinus className="size-3.5" />
                    移出当前分组
                  </button>
                ) : null}
              </>
            ) : null}

            <a
              href={`/api/export?ids=${ids.join(",")}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground"
            >
              <Download className="size-3.5" />
              导出 Markdown
            </a>
            <a
              href={`/api/export?format=json&ids=${ids.join(",")}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:text-foreground"
            >
              <Download className="size-3.5" />
              JSON
            </a>

            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`删除选中的 ${selected.size} 条？此操作不可恢复。`)) return;
                run(() => bulkDelete(ids));
              }}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              删除
            </button>

            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
