"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-4 py-20 text-center">
      <h1 className="text-lg font-semibold">页面出错了</h1>
      <p className="text-sm text-muted-foreground">
        {error.message || "未知错误"}，可以先重试一次；如果一直失败，说明服务端在报错。
      </p>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          重试
        </button>
        <Link href="/" className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground">
          回列表
        </Link>
      </div>
      {error.digest ? <p className="text-xs text-muted-foreground">错误编号：{error.digest}</p> : null}
    </div>
  );
}
