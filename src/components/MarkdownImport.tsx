"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload } from "lucide-react";

/** 导入 Markdown：支持多选文件，或粘贴一段 Markdown 文本 */
export function MarkdownImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState("");

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg("");
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const res = await fetch("/api/entries/markdown", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) {
      setMsg(data.error ?? "导入失败");
      return;
    }
    setMsg(`已导入 ${data.added} 篇${data.skipped ? `，跳过重复 ${data.skipped} 篇` : ""}`);
    router.refresh();
  }

  async function submitText() {
    if (!text.trim()) return;
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/entries/markdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: text }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data.ok) {
      setMsg(data.error ?? "这段内容已经导入过了");
      return;
    }
    setText("");
    setPasteOpen(false);
    setMsg("已导入 1 篇");
    router.refresh();
  }

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">导入 Markdown</span>
        <span className="text-xs text-muted-foreground">支持 .md / .markdown / .txt</span>

        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".md,.markdown,.txt,text/markdown,text/plain"
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
          <button
            type="button"
            onClick={() => setPasteOpen((v) => !v)}
            className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-sm text-muted-foreground hover:text-foreground"
          >
            粘贴文本
          </button>
        </div>
      </div>

      {pasteOpen ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="# 标题&#10;&#10;正文支持 Markdown…"
            className="min-h-32 w-full appearance-none rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPasteOpen(false)}
              className="h-8 rounded-lg px-2.5 text-sm text-muted-foreground hover:text-foreground"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={submitText}
              className="inline-flex h-8 items-center rounded-lg bg-brand px-2.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
            >
              导入
            </button>
          </div>
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
