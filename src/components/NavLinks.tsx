"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const ITEMS = [
  { label: "全部", href: "/", match: (p: string, q: URLSearchParams) => p === "/" && !q.get("readState") && !q.get("favorite") },
  { label: "未读", href: "/?readState=unread", match: (p: string, q: URLSearchParams) => p === "/" && q.get("readState") === "unread" },
  { label: "收藏", href: "/?favorite=1", match: (p: string, q: URLSearchParams) => p === "/" && q.get("favorite") === "1" },
  { label: "批注", href: "/annotations", match: (p: string) => p.startsWith("/annotations") },
];

/**
 * 顶部导航：对齐广学题库 —— 纯文字链接（text-sm font-medium），
 * 不用下划线、不用胶囊底色，当前项只靠字色区分。
 * variant="mobile" 用于移动端展开菜单，纵向排列。
 */
export function NavLinks({
  variant = "desktop",
  onNavigate,
}: {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const mobile = variant === "mobile";

  return (
    <>
      {ITEMS.map((item) => {
        const on = item.match(pathname, params);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            onClick={onNavigate}
            className={[
              "text-sm font-medium transition-colors",
              mobile ? "py-1.5" : "py-2",
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
