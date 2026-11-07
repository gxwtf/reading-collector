"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2, QrCode } from "lucide-react";

/**
 * 微信分享：生成二维码，扫码后在微信里「右上角 → 发送给朋友 / 分享到朋友圈」。
 * 微信内置浏览器不支持程序化调起分享面板（需要公众号 JS-SDK 与域名校验）。
 */
export function ShareQr({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [img, setImg] = useState("");

  useEffect(() => {
    if (!open || !url || img) return;
    QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: "M" })
      .then(setImg)
      .catch(() => setImg(""));
  }, [open, url, img]);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        title="生成二维码，用微信扫一扫"
      >
        <QrCode className="size-3.5" />
        微信
      </button>

      {open ? (
        <div className="absolute right-0 top-9 z-50 w-60 rounded-xl border border-border bg-popover p-3 text-center shadow-lg">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="分享二维码" className="mx-auto size-44 rounded-md bg-white p-1" />
          ) : (
            <div className="flex h-44 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            微信扫一扫打开 → 点右上角「…」→ 发送给朋友 / 分享到朋友圈
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-[11px] text-muted-foreground underline"
          >
            收起
          </button>
        </div>
      ) : null}
    </span>
  );
}
