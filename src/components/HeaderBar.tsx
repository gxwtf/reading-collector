"use client";

import Link from "next/link";
import { BookOpenText, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { NavLinks } from "@/components/NavLinks";
import { SearchBox } from "@/components/SearchBox";

type Props = {
  isLoggedIn: boolean;
  userId?: number;
  userName?: string;
  admin?: number;
  logout: () => Promise<void>;
};

/**
 * 全站统一 header：桌面 56px 高，左侧品牌 + 导航，右侧菜单 / 搜索 / 主题 / 账号。
 * 布局与间距对齐广学题库（品牌 text-lg font-bold，导航 space-x-6 纯文字，无下划线）。
 * 移动端菜单按钮与账号同侧，展开为通栏纵向列表并把内容顶下去（同题库，不用浮层卡片）。
 */
export function HeaderBar({ isLoggedIn, userId, userName, admin, logout }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-8 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-lg font-bold text-foreground">
          <BookOpenText className="size-5 text-brand" />
          <span>阅读收集</span>
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          <NavLinks />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "收起菜单" : "打开菜单"}
            aria-expanded={menuOpen}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground sm:hidden"
          >
            <Menu className="size-5" />
          </button>

          <SearchBox />

          <ThemeToggle />

          {isLoggedIn ? (
            <UserMenu userId={userId} userName={userName} admin={admin} logout={logout} />
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              登录
            </Link>
          )}
        </div>
      </div>

      {/* 移动端展开菜单：通栏纵向列表，样式对齐题库 */}
      {menuOpen ? (
        <div className="sm:hidden">
          <div className="flex flex-col gap-1 border-t border-border bg-background px-4 py-3">
            <NavLinks variant="mobile" onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
