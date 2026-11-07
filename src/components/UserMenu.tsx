"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bookmark, LogOut, MessageSquareQuote, Settings, Tag } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";

/**
 * 头像菜单：退出、设置等入口收进下拉，避免顶部拥挤。
 * 参考 gxexercise 的 UserMenu 交互。
 */
export function UserMenu({
  userId,
  userName,
  admin,
  logout,
}: {
  userId?: number;
  userName?: string | null;
  admin?: number;
  logout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="账户菜单"
        className="flex items-center gap-2 rounded-full text-sm transition-opacity hover:opacity-85"
      >
        <span className="hidden max-w-28 truncate text-muted-foreground lg:inline">
          {userName}
          {admin ? " (admin)" : ""}
        </span>
        <UserAvatar userId={userId} name={userName} size={28} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <div className="px-2 py-1.5 text-xs text-muted-foreground">我的账户</div>

          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            <Bookmark className="size-4" />
            我的收藏
          </Link>
          <Link
            href="/annotations"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            <MessageSquareQuote className="size-4" />
            批注整理
          </Link>
          <Link
            href="/tags"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            <Tag className="size-4" />
            标签管理
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            <Settings className="size-4" />
            设置
          </Link>
          <a
            href="https://account.gxwtf.cn/"
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            <UserAvatar userId={userId} name={userName} size={16} />
            广学账号
          </a>

          <div className="my-1 h-px bg-border" />

          <form
            action={async () => {
              setOpen(false);
              await logout();
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut className="size-4" />
              退出登录
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
