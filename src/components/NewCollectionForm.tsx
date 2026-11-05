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
        className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <button
        type="submit"
        disabled={pending}
        aria-label="新建分组"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <Plus className="size-3.5" />
      </button>
      {state.error ? <span className="text-[11px] text-destructive">{state.error}</span> : null}
    </form>
  );
}
