"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, Upload } from "lucide-react";

/** 导入 EPUB：支持多选，服务端解包转 Markdown 入库 */
export function EpubImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg("");
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const res = await fetch("/api/entries/epub", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) {
      setMsg(data.error ?? "导入失败");
      return;
    }
    setMsg(
      `已导入 ${data.added} 本${data.skipped ? `，跳过 ${data.skipped} 本（重复或解析失败）` : ""}`,
    );
    router.refresh();
  }

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-2">
        <BookOpen className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">导入 EPUB</span>
        <span className="text-xs text-muted-foreground">单本 30MB 以内</span>

        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".epub,application/epub+zip"
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            选择文件
          </button>
        </div>
      </div>

      {msg ? <p className="mt-2 text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
