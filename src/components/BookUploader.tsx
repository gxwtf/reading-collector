"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";

type Job = { name: string; state: "uploading" | "ok" | "error"; message?: string };

export function BookUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const upload = async (files: FileList) => {
    setBusy(true);
    const list = Array.from(files);
    setJobs(list.map((f) => ({ name: f.name, state: "uploading" as const })));

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/books/upload", { method: "POST", body });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setJobs((prev) =>
          prev.map((j, idx) =>
            idx === i ? { ...j, state: res.ok ? "ok" : "error", message: data.error } : j,
          ),
        );
      } catch (e) {
        setJobs((prev) =>
          prev.map((j, idx) =>
            idx === i ? { ...j, state: "error", message: (e as Error).message } : j,
          ),
        );
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  };

  return (
    <div className="rounded-xl border border-dashed border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {busy ? "上传中…" : "上传书籍"}
        </button>
        <span className="text-xs text-muted-foreground">
          支持 epub / pdf / cbz / mobi / azw3 / fb2 / txt，单个 300MB 以内，可多选
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".epub,.pdf,.cbz,.cbr,.mobi,.azw3,.fb2,.txt"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files);
        }}
      />

      {jobs.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {jobs.map((j, i) => (
            <li key={`${j.name}-${i}`} className="flex items-center gap-2 text-xs">
              <span
                className={
                  j.state === "ok"
                    ? "text-brand"
                    : j.state === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                }
              >
                {j.state === "ok" ? "✓" : j.state === "error" ? "✕" : "…"}
              </span>
              <span className="truncate">{j.name}</span>
              {j.message ? <span className="text-muted-foreground">（{j.message}）</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
