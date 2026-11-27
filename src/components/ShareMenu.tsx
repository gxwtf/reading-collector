"use client";

import { useState, useTransition } from "react";
import { Check, ImageIcon, Link2, Loader2, MessageCircle, Share2, SquareArrowOutUpRight, X } from "lucide-react";

import { toggleShare } from "@/actions/share";
import { ShareCardDialog } from "@/components/ShareCardDialog";

export function ShareMenu({
  entryId,
  token,
  title,
  text,
  site,
  /** primary：详情页右栏的「生成精美小图分享」陶土主按钮；ghost：顶部小按钮 */
  variant = "ghost",
}: {
  entryId: number;
  token: string | null;
  title: string;
  text: string;
  site: string;
  variant?: "ghost" | "primary";
}) {
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState(false);
  const [pending, start] = useTransition();
  const [hint, setHint] = useState("");

  const origin = typeof window === "undefined" ? "https://reading.gxwtf.cn" : window.location.origin;
  const url = token ? `${origin}/s/${token}` : "";

  const flash = (m: string) => {
    setHint(m);
    setTimeout(() => setHint(""), 2200);
  };

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      flash("链接已复制");
    } catch {
      window.prompt("复制这个链接", url);
    }
  }

  async function toWechat() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* 忽略 */
    }
    const ua = navigator.userAgent;
    if (/MicroMessenger/i.test(ua)) {
      flash("已复制，点右上角「…」→ 发送给朋友");
    } else if (/Android|iPhone|iPad|iPod/i.test(ua)) {
      window.location.href = "weixin://";
      flash("正在打开微信，粘贴即可发送");
    } else {
      flash("链接已复制，到微信里粘贴");
    }
  }

  const item =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-paper-muted";

  const trigger =
    variant === "primary"
      ? "inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-fill text-[15px] font-medium text-brand-foreground transition-colors hover:bg-brand-fill/92"
      : "inline-flex items-center gap-1.5 rounded-xl border border-hairline px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-hairline-dashed hover:text-ink";

  return (
    <div className={variant === "primary" ? "w-full" : "relative"}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={trigger} aria-expanded={open}>
        <Share2 className="size-3.5" />
        {variant === "primary" ? "生成精美小图分享" : "分享"}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="关闭菜单"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className={[
              "absolute z-50 mt-1 w-48 rounded-xl border border-hairline bg-popover p-1",
              variant === "primary" ? "left-0" : "right-0",
            ].join(" ")}
          >
            <button
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                setCard(true);
              }}
            >
              <ImageIcon className="size-3.5 text-brand-strong" />
              生成分享图
            </button>

            {token ? (
              <>
                <button type="button" className={item} onClick={toWechat}>
                  <MessageCircle className="size-3.5 text-brand-strong" />
                  发到微信
                </button>
                <button type="button" className={item} onClick={copy}>
                  <Link2 className="size-3.5" />
                  复制链接
                </button>
                <a href={`/s/${token}`} target="_blank" rel="noreferrer" className={item}>
                  <SquareArrowOutUpRight className="size-3.5" />
                  预览分享页
                </a>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => toggleShare(entryId))}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-destructive transition-colors hover:bg-paper-muted disabled:opacity-50"
                >
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                  停止分享
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => start(() => toggleShare(entryId))}
                className={item}
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                生成分享链接
              </button>
            )}
          </div>
        </>
      ) : null}

      {hint ? (
        <div className="absolute right-0 top-full z-50 mt-1 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[12px] text-paper">
          {hint}
        </div>
      ) : null}

      {card ? (
        <ShareCardDialog
          kind="article"
          title={title}
          text={text}
          site={site}
          url={url || `https://reading.gxwtf.cn/entry/${entryId}`}
          onClose={() => setCard(false)}
        />
      ) : null}
    </div>
  );
}
