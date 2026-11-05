import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { getSession } from "@/lib/session";
import { logout } from "@/actions/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SearchBox } from "@/components/SearchBox";

export async function Navbar() {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-brand-red">
          <BookOpenText className="size-5" />
          <span>阅读收集</span>
        </Link>

        <nav className="ml-2 hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
          <Link href="/" className="transition-colors hover:text-foreground">
            全部
          </Link>
          <Link href="/?readState=unread" className="transition-colors hover:text-foreground">
            未读
          </Link>
          <Link href="/?favorite=1" className="transition-colors hover:text-foreground">
            收藏
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <SearchBox />
          <ThemeToggle />
          {session.isLoggedIn ? (
            <>
              <span className="hidden text-muted-foreground sm:inline">{session.userName}</span>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-md border border-border px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  退出
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
            >
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
