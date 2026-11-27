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

const actionBtn =
  "inline-flex items-center gap-1.5 rounded-[10px] border border-hairline px-2.5 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-hairline-dashed hover:text-ink disabled:opacity-50";

export function EntryList({
  entries,
  collections,
  activeCollectionId,
  searchQuery,
}: {
  entries: EntryCardData[];
  collections: CollectionOption[];
  activeCollectionId?: number;
  /** 当前搜索词；点进详情时带过去，正文里才知道高亮什么 */
  searchQuery?: string;
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
      <div className="rounded-2xl border border-dashed border-hairline-dashed px-6 py-14 text-center">
        <p className="text-[15px] text-ink-2">
          {searchQuery ? `没有找到和「${searchQuery}」相关的内容` : "这里还没有内容"}
        </p>
        <p className="mt-1.5 text-[13px] text-ink-3">
          {searchQuery ? "换个词试试，或清空搜索看全部" : "把想读的链接丢进上面的投放区，抓取会在后台完成"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[13px] text-ink-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => toggleAll(e.target.checked)}
            className="size-4 accent-[var(--brand-strong)]"
          />
          全选
        </label>
        {selected.size > 0 ? <span>已选 {selected.size} 条</span> : null}
      </div>

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {entries.map((entry) => (
          <li key={entry.id} className="min-w-0">
            <EntryCard
              entry={entry}
              selectable
              selected={selected.has(entry.id)}
              onToggle={toggle}
              searchQuery={searchQuery}
            />
          </li>
        ))}
      </ul>

      {selected.size > 0 ? (
        <div className="sticky bottom-4 z-20 rounded-2xl border border-hairline bg-card/95 p-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-medium text-ink">已选 {selected.size} 条</span>

            <button type="button" disabled={pending} onClick={() => run(() => bulkSetReadState(ids, "done"))} className={actionBtn}>
              <CheckCheck className="size-3.5" />
              标记已读
            </button>

            <button type="button" disabled={pending} onClick={() => run(() => bulkSetReadState(ids, "unread"))} className={actionBtn}>
              <Undo2 className="size-3.5" />
              标记未读
            </button>

            {collections.length > 0 ? (
              <>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  aria-label="选择分组"
                  className="h-8 rounded-[10px] border border-input bg-transparent px-2 text-[13px] text-ink outline-none"
                >
                  <option value="">选择分组…</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <button type="button" disabled={pending || !target} onClick={() => run(() => bulkAddToCollection(ids, Number(target)))} className={actionBtn}>
                  <FolderPlus className="size-3.5" />
                  加入
                </button>

                {activeCollectionId ? (
                  <button type="button" disabled={pending} onClick={() => run(() => bulkRemoveFromCollection(ids, activeCollectionId))} className={actionBtn}>
                    <FolderMinus className="size-3.5" />
                    移出当前分组
                  </button>
                ) : null}
              </>
            ) : null}

            <a href={`/api/export?ids=${ids.join(",")}`} className={actionBtn}>
              <Download className="size-3.5" />
              导出 Markdown
            </a>
            <a href={`/api/export?format=json&ids=${ids.join(",")}`} className={actionBtn}>
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
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-destructive/40 px-2.5 py-1.5 text-[13px] text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              删除
            </button>

            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink"
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
