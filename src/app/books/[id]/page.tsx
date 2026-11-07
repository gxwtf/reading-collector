import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "书籍笔记 · 阅读收集" };

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.userId) notFound();

  const { id } = await params;
  const book = await prisma.book.findUnique({
    where: { id: Number(id) },
    include: { annotations: { orderBy: { id: "asc" } } },
  });
  if (!book) notFound();

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Link href="/books" className="text-xs text-muted-foreground hover:text-brand">
          ← 书库
        </Link>
        <h1 className="text-lg font-semibold">{book.title}</h1>
        <p className="text-xs text-muted-foreground">
          {book.author || "未知作者"} · {book.format.toUpperCase()} · 标注 {book.annotations.length} 条
          {book.readStatus ? ` · ${book.readStatus}` : ""}
        </p>
      </div>

      {book.annotations.length === 0 ? (
        <p className="rounded-xl border border-border px-4 py-10 text-center text-sm text-muted-foreground">
          这本书还没有笔记。在 Readest 里划线后，回到这里刷新即可。
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
    </div>
  );
}
