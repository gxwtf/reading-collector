"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";

import { ShareCardDialog } from "@/components/ShareCardDialog";

/** 文章分享图：标题 + 摘要 + 二维码 */
export function EntryShareCard({
  title,
  text,
  site,
  url,
  className,
}: {
  title: string;
  text: string;
  site: string;
  url: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        }
      >
        <ImageIcon className="size-3.5" />
        分享图
      </button>

      {open ? (
        <ShareCardDialog
          kind="article"
          title={title}
          text={text}
          site={site}
          url={url}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
