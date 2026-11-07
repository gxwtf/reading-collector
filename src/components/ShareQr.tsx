"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Loader2, QrCode } from "lucide-react";

type Env = "wechat" | "mobile" | "desktop";

function detectEnv(): Env {
  const ua = navigator.userAgent;
  if (/MicroMessenger/i.test(ua)) return "wechat";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return "mobile";
  return "desktop";
}

/**
 * 微信分享：
 * - 手机浏览器：点一下先把链接复制好，再跳转微信（weixin://），在聊天里粘贴即可发送；
 * - 微信内置浏览器：无法程序化调起分享面板（需要公众号 JS-SDK 与域名校验），
 *   只复制链接并提示「右上角 … → 发送给朋友」；
 * - 桌面端：没有 weixin:// 协议，退回二维码，用手机扫一扫。
 */
export function ShareQr({ url }: { url: string }) {
  const [env, setEnv] = useState<Env>("desktop");
  const [open, setOpen] = useState(false);
  const [img, setImg] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setEnv(detectEnv()), []);

  useEffect(() => {
    if (env !== "desktop" || !open || !url || img) return;
    QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: "M" })
      .then(setImg)
      .catch(() => setImg(""));
  }, [env, open, url, img]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      window.prompt("复制这个链接", url);
      return false;
    }
  }

  async function handleClick() {
    if (env === "desktop") {
      setOpen((v) => !v);
      return;
    }
    const ok = await copy();
    setCopied(ok);
    setOpen(true);
    if (env === "mobile") {
      // 先复制再跳，微信里长按粘贴即可发送
      setTimeout(() => {
        window.location.href = "weixin://";
      }, 120);
    }
  }

  function close() {
    setOpen(false);
    setCopied(false);
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        title={env === "desktop" ? "生成二维码，用微信扫一扫" : "复制链接并打开微信"}
      >
        <QrCode className="size-3.5" />
        微信
      </button>

      {open ? (
        <div className="absolute right-0 top-9 z-50 w-60 rounded-xl border border-border bg-popover p-3 text-center shadow-lg">
          {env === "desktop" ? (
            img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="分享二维码" className="mx-auto size-44 rounded-md bg-white p-1" />
            ) : (
              <div className="flex h-44 items-center justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            )
          ) : (
            <div className="flex h-20 flex-col items-center justify-center gap-1 text-muted-foreground">
              {copied ? <Check className="size-5 text-brand" /> : <QrCode className="size-5" />}
              <span className="text-xs">{copied ? "链接已复制" : "请手动复制链接"}</span>
            </div>
          )}

          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            {env === "desktop"
              ? "微信扫一扫打开 → 点右上角「…」→ 发送给朋友 / 分享到朋友圈"
              : env === "wechat"
                ? "点右上角「…」→ 发送给朋友 / 分享到朋友圈"
                : "已跳转微信，在聊天框里粘贴链接即可发送"}
          </p>

          {env !== "desktop" ? (
            <a
              href="weixin://"
              className="mt-2 inline-block text-[11px] text-brand underline"
            >
              没跳过去？点这里打开微信
            </a>
          ) : null}

          <button
            type="button"
            onClick={close}
            className="mt-2 block w-full text-[11px] text-muted-foreground underline"
          >
            收起
          </button>
        </div>
      ) : null}
    </span>
  );
}
