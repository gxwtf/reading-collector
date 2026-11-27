"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
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
 * 全站统一 header（设计说明 §4.1）。
 *
 * 左：28×28 陶土方块 + 衬线品牌名；中：搜索框；右：主按钮 + 主题 + 账号。
 * 高度 64px，比旧版高 8px —— 44px 的搜索框和按钮塞不进 56px 里还留呼吸。
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
    <header className="sticky top-0 z-50 border-b border-hairline bg-paper/92 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-4 px-4 lg:gap-8 lg:px-12">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-serif text-[22px] font-semibold leading-tight text-ink"
        >
          <span aria-hidden className="size-7 shrink-0 rounded-lg bg-brand" />
          <span className="whitespace-nowrap">稍后再看</span>
        </Link>

        <nav className="hidden shrink-0 items-center gap-5 sm:flex lg:gap-6">
          <NavLinks />
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <div className="hidden min-w-0 flex-1 md:block">
            <SearchBox />
          </div>

          {/* 锚点而不是回调：Header 是服务端渲染的，「丢进来」要能在任何页面把人送回首页投放区 */}
          <Link
            href="/#drop"
            className="hidden h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/88 sm:inline-flex"
          >
            ＋ 丢进来
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "收起菜单" : "打开菜单"}
            aria-expanded={menuOpen}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-paper-muted hover:text-ink sm:hidden"
          >
            <Menu className="size-5" />
          </button>

          <ThemeToggle />

          {isLoggedIn ? (
            <UserMenu userId={userId} userName={userName} admin={admin} logout={logout} />
          ) : (
            <Link
              href="/login"
              className="shrink-0 whitespace-nowrap rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground"
            >
              登录
            </Link>
          )}
        </div>
      </div>

      {/* 移动端展开菜单：通栏纵向列表 */}
      {menuOpen ? (
        <div className="sm:hidden">
          <div className="flex flex-col gap-1 border-t border-hairline bg-paper px-4 py-3">
            <NavLinks variant="mobile" onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
