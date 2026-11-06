"use client";

import { useState } from "react";

/**
 * 广学账号头像：复用主站 gxwtf.cn/avatar 接口（会 302 到 Gravatar 镜像）。
 * 加载失败时回退到用户名首字母，避免破图。
 */
export function UserAvatar({
  userId,
  name,
  size = 28,
}: {
  userId?: number;
  name?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name ?? "?").slice(0, 1).toUpperCase();

  if (!userId || failed) {
    return (
      <span
        aria-hidden
        title={name ?? ""}
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-medium text-brand"
      >
        {initial}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://gxwtf.cn/avatar?userId=${userId}&s=${size * 2}`}
      alt={name ?? "头像"}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full bg-muted object-cover"
    />
  );
}
