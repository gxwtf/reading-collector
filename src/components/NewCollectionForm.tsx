"use client";

import { useActionState, useRef } from "react";
import { Plus } from "lucide-react";
import { createCollection, type CollectionState } from "@/actions/collections";

const initial: CollectionState = { ok: false };

export function NewCollectionForm() {
  const [state, action, pending] = useActionState(createCollection, initial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      className="mt-1 flex items-center gap-1"
    >
      <input
        name="name"
        required
        maxLength={40}
        placeholder="新建分组"
        className="h-9 min-w-0 flex-1 rounded-[10px] border border-input bg-transparent px-2.5 text-[13px] outline-none placeholder:text-ink-3 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
      />
      <button
        type="submit"
        disabled={pending}
        aria-label="新建分组"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-hairline text-ink-2 transition-colors hover:border-hairline-dashed hover:text-ink disabled:opacity-50"
      >
        <Plus className="size-3.5" />
      </button>
      {state.error ? <span className="text-[11px] text-destructive">{state.error}</span> : null}
    </form>
  );
}
