import Link from "next/link";
import { BookOpenText, Menu } from "lucide-react";
import { getSession } from "@/lib/session";
import { logout } from "@/actions/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { NavLinks } from "@/components/NavLinks";
import { SearchBox } from "@/components/SearchBox";

/**
 * 全站统一 header：固定 56px 高，左侧品牌 + 导航，右侧搜索 / 主题 / 设置 / 账号。
 * 移动端导航收进 <details>，保持同样的视觉层次。
 */
export async function Navbar() {
  const session = await getSession();


  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold text-foreground">
          <BookOpenText className="size-5 text-brand" />
          <span>阅读收集</span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 sm:flex">
          <NavLinks />
        </nav>

        {/* 移动端菜单 */}
        <details className="group relative sm:hidden">
          <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-border text-muted-foreground">
            <Menu className="size-4" />
          </summary>
          <div className="absolute left-0 top-11 z-50 flex w-40 flex-col gap-1 rounded-2xl border border-border bg-card p-2 shadow-lg">
            <NavLinks />
          </div>
        </details>

        <div className="ml-auto flex items-center gap-2">
          <SearchBox />

          <ThemeToggle />

          {session.isLoggedIn ? (
            <UserMenu
              userId={session.userId}
              userName={session.userName}
              admin={session.admin}
              logout={logout}
            />
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
    </header>
  );
}
