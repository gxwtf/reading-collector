import Link from "next/link";
import { BookOpenText, Menu, Settings } from "lucide-react";
import { getSession } from "@/lib/session";
import { logout } from "@/actions/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SearchBox } from "@/components/SearchBox";

/**
 * 全站统一 header：固定 56px 高，左侧品牌 + 导航，右侧搜索 / 主题 / 设置 / 账号。
 * 移动端导航收进 <details>，保持同样的视觉层次。
 */
export async function Navbar() {
  const session = await getSession();

  const navLinks = (
    <>
      <Link href="/" className="px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        全部
      </Link>
      <Link href="/?readState=unread" className="px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        未读
      </Link>
      <Link href="/?favorite=1" className="px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        收藏
      </Link>
      <Link href="/annotations" className="px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        批注
      </Link>
    </>
  );

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold text-foreground">
          <BookOpenText className="size-5 text-brand" />
          <span>阅读收集</span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 sm:flex">{navLinks}</nav>

        {/* 移动端菜单 */}
        <details className="group relative sm:hidden">
          <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-border text-muted-foreground">
            <Menu className="size-4" />
          </summary>
          <div className="absolute left-0 top-11 z-50 flex w-36 flex-col gap-1 rounded-xl bg-card ring-1 ring-foreground/10 p-2 shadow-lg">
            {navLinks}
          </div>
        </details>

        <div className="ml-auto flex items-center gap-2">
          <SearchBox />

          <ThemeToggle />

          {session.isLoggedIn ? (
            <>
              <Link
                href="/settings"
                aria-label="设置"
                className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
              >
                <Settings className="size-4" />
              </Link>
              <span className="hidden max-w-24 truncate text-sm text-muted-foreground md:inline">
                {session.userName}
              </span>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-md border border-border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  退出
                </button>
              </form>
            </>
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
