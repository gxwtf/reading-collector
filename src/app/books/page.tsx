import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked, BookOpen, Download, ExternalLink } from "lucide-react";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { syncBooks } from "@/lib/readest";
import { BookUploader } from "@/components/BookUploader";

export const metadata: Metadata = { title: "书库 · 阅读收集" };
export const dynamic = "force-dynamic";

export default async function BooksPage() {
  const session = await getSession();
  if (!session.userId) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-20 text-center">
        <h1 className="text-lg font-semibold">先登录再看书库</h1>
        <Link href="/login" className="text-sm text-brand hover:underline">
          去登录
        </Link>
      </div>
    );
  }

  await syncBooks(session.userId);
  const books = await prisma.book.findMany({
    where: { userId: session.userId },
    orderBy: [{ lastReadTime: "desc" }, { title: "asc" }],
    include: { _count: { select: { annotations: { where: { userId: session.userId } } } } },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <BookOpen className="size-4 text-brand" />
        <h1 className="text-lg font-semibold">书库</h1>
        <span className="text-xs text-muted-foreground">共 {books.length} 本</span>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="/calibre/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-brand"
          >
            <BookMarked className="size-3.5" />
            云书库
          </a>
          <a
            href="/readest-boot"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-brand"
          >
            <ExternalLink className="size-3.5" />
            打开阅读器
          </a>
        </div>
      </div>

      <BookUploader />

      <p className="text-xs text-muted-foreground">
        还没连过阅读器？
        <a href="/readest-setup" className="ml-1 text-brand hover:underline">
          查看同步设置
        </a>
      </p>

      {books.length === 0 ? (
        <p className="rounded-xl border border-border px-4 py-10 text-center text-sm text-muted-foreground">
          书库还是空的。点上面「上传书籍」，或从阅读器同步上来。
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {books.map((b) => (
            <li
              key={b.id}
              className="flex gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/40"
            >
              <Link href={`/books/${b.id}`} className="shrink-0">
                {b.coverFile ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/books/${b.id}/cover`}
                    alt=""
                    className="h-24 w-16 rounded-md object-cover ring-1 ring-border"
                  />
                ) : (
                  <div className="flex h-24 w-16 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground">
                    无封面
                  </div>
                )}
              </Link>

              <div className="min-w-0 flex-1 space-y-1">
                <Link href={`/books/${b.id}`} className="block">
                  <h2 className="truncate text-sm font-medium">{b.title}</h2>
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {b.author || "未知作者"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {b.format.toUpperCase()}
                  {b.pageCount ? ` · ${b.pageCount} 页` : ""}
                  {b._count.annotations ? ` · 标注 ${b._count.annotations}` : ""}
                  {b.epubPercent != null ? ` · 已读 ${Math.round(b.epubPercent)}%` : ""}
                </p>
                <a
                  href={`/api/books/${b.id}/file`}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-brand"
                >
                  <Download className="size-3" />
                  下载
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
