"use client";

import { useState, useTransition } from "react";
import { Check, Link2, Loader2, X } from "lucide-react";
import { toggleShare } from "@/actions/share";
import { ShareQr } from "@/components/ShareQr";

/** 分享开关：未分享时一键生成；已分享时可直接复制链接或停止分享 */
export function ShareButton({ entryId, token }: { entryId: number; token: string | null }) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const url = token
    ? `${typeof window === "undefined" ? "https://reading.gxwtf.cn" : window.location.origin}/s/${token}`
    : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("复制这个链接", url);
    }
  }

  if (!token) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => toggleShare(entryId))}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
        分享
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded-lg border border-brand/40 bg-brand/10 px-2.5 py-1.5 text-xs text-brand transition-colors hover:bg-brand/20"
        title={url}
      >
        {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
        {copied ? "已复制" : "复制链接"}
      </button>
      <ShareQr url={url} />
      <a
        href={`/s/${token}`}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        预览
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => toggleShare(entryId))}
        aria-label="停止分享"
        className="inline-flex size-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
      </button>
    </span>
  );
}
