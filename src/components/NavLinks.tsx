"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const ITEMS = [
  { label: "全部", href: "/", match: (p: string, q: URLSearchParams) => p === "/" && !q.get("readState") && !q.get("favorite") },
  { label: "未读", href: "/?readState=unread", match: (p: string, q: URLSearchParams) => p === "/" && q.get("readState") === "unread" },
  { label: "收藏", href: "/?favorite=1", match: (p: string, q: URLSearchParams) => p === "/" && q.get("favorite") === "1" },
  { label: "批注", href: "/annotations", match: (p: string) => p.startsWith("/annotations") },
];

/** 顶部导航：选中项用品牌红下划线（对齐新版题库） */
export function NavLinks() {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <>
      {ITEMS.map((item) => {
        const on = item.match(pathname, params);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "relative px-3 py-2 text-sm transition-colors",
              on
                ? "font-medium text-foreground after:absolute after:inset-x-2 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-brand"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
