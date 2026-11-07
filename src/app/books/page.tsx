import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ExternalLink } from "lucide-react";

import { BookUploader } from "@/components/BookUploader";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { syncBooks } from "@/lib/readest";

export const metadata: Metadata = { title: "书库 · 阅读收集" };

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

  await syncBooks();
  const books = await prisma.book.findMany({
    orderBy: [{ lastReadTime: "desc" }, { title: "asc" }],
    include: { _count: { select: { annotations: true } } },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <BookOpen className="size-4 text-brand" />
        <h1 className="text-lg font-semibold">书库</h1>
        <span className="text-xs text-muted-foreground">共 {books.length} 本 · 与 Readest 同步</span>
        <a
          href="/readest"
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-brand"
        >
          <ExternalLink className="size-3.5" />
          打开阅读器
        </a>
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
          书库还是空的。点右上角「打开阅读器」，用 WebDAV 把 epub 传上来，这里就会出现。
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {books.map((b) => (
            <li key={b.id} className="rounded-xl border border-border p-4 transition-colors hover:bg-muted/40">
              <Link href={`/books/${b.id}`} className="block space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{b.title}</span>
                  <span className="shrink-0 text-xs uppercase text-muted-foreground">{b.format}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {b.author || "未知作者"} · 标注 {b._count.annotations} 条
                  {b.epubPercent != null ? ` · 已读 ${Math.round(b.epubPercent)}%` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
