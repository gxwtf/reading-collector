"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";

import { ShareCardDialog } from "@/components/ShareCardDialog";

/** 批注页里的单条分享图按钮 */
export function AnnotationShareButton({
  title,
  text,
  site,
  url,
}: {
  title: string;
  text: string;
  site: string;
  url: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-brand"
        title="生成分享图"
      >
        <ImageIcon className="size-3" />
        图
      </button>

      {open ? (
        <ShareCardDialog
          kind="quote"
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
