import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "书籍详情 · 阅读收集" };
export const dynamic = "force-dynamic";

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.userId) notFound();

  const { id } = await params;
  const book = await prisma.book.findFirst({
    where: { id: Number(id), userId: session.userId },
    include: {
      annotations: { where: { userId: session.userId }, orderBy: { id: "asc" } },
      bookmarks: { orderBy: { id: "asc" } },
    },
  });
  if (!book) notFound();

  const facts = [
    ["格式", book.format.toUpperCase()],
    ["页数", book.pageCount ? `${book.pageCount}` : null],
    ["出版社", book.publisher],
    ["出版年", book.published],
    ["ISBN", book.isbn],
    ["语言", book.language],
    ["进度", book.epubPercent != null ? `${Math.round(book.epubPercent)}%` : null],
    ["文件大小", `${(Number(book.fileSize) / 1024 / 1024).toFixed(1)} MB`],
  ].filter(([, v]) => v && v !== "—") as [string, string][];

  return (
    <div className="space-y-6">
      <Link href="/books" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand">
        <ArrowLeft className="size-3.5" />
        书库
      </Link>

      <div className="flex flex-col gap-5 sm:flex-row">
        {book.coverFile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/books/${book.id}/cover`}
            alt=""
            className="h-56 w-40 shrink-0 self-start rounded-lg object-cover ring-1 ring-border"
          />
        ) : (
          <div className="flex h-56 w-40 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
            无封面
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="text-xl font-semibold leading-snug">{book.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{book.author || "未知作者"}</p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="truncate">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="flex gap-2 pt-1">
            <a
              href={`/api/books/${book.id}/file`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              <Download className="size-3.5" />
              下载
            </a>
            <a
              href="/readest"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-brand"
            >
              在阅读器中打开
            </a>
          </div>

          {book.description ? (
            <details className="rounded-lg border border-border p-3" open={false}>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">内容简介</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{book.description}</p>
            </details>
          ) : null}
        </div>
      </div>

      {book.bookmarks.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">书签 {book.bookmarks.length}</h2>
          <ul className="space-y-1">
            {book.bookmarks.map((b) => (
              <li key={b.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                <span className="text-brand">◆</span> {b.title || b.cfi}
                {b.notes ? <span className="ml-2 text-xs text-muted-foreground">{b.notes}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">笔记 {book.annotations.length}</h2>
        {book.annotations.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-10 text-center text-sm text-muted-foreground">
            这本书还没有笔记。在阅读器里划线后，这里就会出现。
          </p>
        ) : (
          <ul className="space-y-3">
            {book.annotations.map((a) => (
              <li key={a.id} className="rounded-xl border border-border p-4">
                {a.chapterTitle ? (
                  <p className="mb-1 text-xs text-muted-foreground">{a.chapterTitle}</p>
                ) : null}
                <blockquote className="border-l-2 border-brand/60 pl-3 text-sm leading-relaxed">
                  {a.text}
                </blockquote>
                {a.note ? <p className="mt-2 text-sm text-muted-foreground">批注：{a.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
