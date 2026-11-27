"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImagePlus, Loader2, Upload } from "lucide-react";

/**
 * 导入 Markdown：支持多选文件、粘贴 Markdown，或上传图片（图片会以 Markdown
 * 语法插进粘贴框）。
 *
 * 图片是「附件」而非「条目」——单独一张图没有正文可读，所以先传附件拿到
 * `/api/attachments/<id>`，再以 `![](url)` 的形式落进正文，最后由用户决定
 * 是存成新的一条还是粘贴进已有文章。
 */
export function MarkdownImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [msg, setMsg] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState("");

  /** 把图片插到光标所在位置，没有光标就追加到末尾 */
  const insertAtCursor = useCallback((snippet: string) => {
    setText((prev) => (prev ? `${prev}${prev.endsWith("\n") ? "" : "\n\n"}${snippet}\n` : `${snippet}\n`));
  }, []);

  async function uploadImages(files: FileList | File[] | null) {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    setUploadingImage(true);
    setMsg("");
    const fd = new FormData();
    list.forEach((f) => fd.append("files", f));
    try {
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "图片上传失败");
        return;
      }
      const snippets = (data.attachments as { url: string }[])
        .map((a) => `![](${a.url})`)
        .join("\n");
      setPasteOpen(true);
      insertAtCursor(snippets);
      setMsg(
        `已上传 ${data.added} 张图片，${data.errors?.length ? `跳过 ${data.errors.length} 张（${data.errors[0]}）` : "已插入到下方文本框"}`,
      );
    } catch {
      setMsg("图片上传失败，请重试");
    } finally {
      setUploadingImage(false);
      if (imageRef.current) imageRef.current.value = "";
    }
  }

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
        <span className="text-xs text-muted-foreground">支持 .md / .markdown / .txt / 图片</span>

        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <input
            ref={imageRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
            className="hidden"
            onChange={(e) => uploadImages(e.target.files)}
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
            disabled={uploadingImage}
            onClick={() => imageRef.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {uploadingImage ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
            上传图片
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
        <div
          className="mt-3 space-y-2"
          onDragOver={(e) => {
            // 拖图片进来直接传，省一次点「上传图片」
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
            if (files.length === 0) return;
            e.preventDefault();
            void uploadImages(files);
          }}
        >
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
              className="inline-flex h-8 items-center rounded-lg bg-brand-fill px-2.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
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
