import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked, BookOpen, Download, Search } from "lucide-react";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { syncBooks } from "@/lib/readest";
import { BookUploader } from "@/components/BookUploader";

export const metadata: Metadata = { title: "书库 · 阅读收集" };
export const dynamic = "force-dynamic";

function Progress({ value }: { value: number | null }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
  if (value == null) {
    return <span className="text-[11px] text-muted-foreground">未开始</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums text-[11px] text-muted-foreground">{pct}%</span>
    </span>
  );
}

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

  const reading = books.filter((b) => (b.epubPercent ?? 0) > 0 && (b.epubPercent ?? 0) < 99);
  const total = books.length;

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-center gap-3">
        <BookOpen className="size-5 text-brand" />
        <h1 className="text-xl font-semibold">书库</h1>
        <span className="text-xs text-muted-foreground">
          {total} 本{reading.length ? ` · ${reading.length} 本在读` : ""}
        </span>
        <a
          href="/api/calibre-login"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <BookMarked className="size-3.5" />
          云书库阅读
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <BookUploader />
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">
            书库按广学账号隔离：这里的书、封面、笔记只属于当前账号。上传后会自动清洗书名、抓取元数据与封面。
          </p>
        </div>
      </div>

      {/* 继续阅读 */}
      {reading.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">继续阅读</h2>
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {reading.slice(0, 6).map((b) => (
              <li key={b.id} className="w-32 shrink-0">
                <Link href={`/books/${b.id}`} className="block space-y-1.5">
                  {b.coverFile ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/books/${b.id}/cover`}
                      alt=""
                      className="h-40 w-32 rounded-lg object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="flex h-40 w-32 items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground">
                      无封面
                    </div>
                  )}
                  <p className="truncate text-xs font-medium">{b.title}</p>
                  <Progress value={b.epubPercent} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 全部 */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">全部藏书</h2>

        {books.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            书库还是空的。上传一本 epub，或从阅读器同步上来。
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {books.map((b) => (
              <li
                key={b.id}
                className="group flex gap-3 rounded-xl border border-border p-3 transition-colors hover:border-brand/40 hover:bg-muted/30"
              >
                <Link href={`/books/${b.id}`} className="shrink-0">
                  {b.coverFile ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/books/${b.id}/cover`}
                      alt=""
                      className="h-28 w-20 rounded-md object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="flex h-28 w-20 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground">
                      无封面
                    </div>
                  )}
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/books/${b.id}`}>
                    <h3 className="truncate text-sm font-medium group-hover:text-brand">{b.title}</h3>
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {b.author || "未知作者"}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5 uppercase">{b.format}</span>
                    {b.pageCount ? <span>{b.pageCount} 页</span> : null}
                    {b._count.annotations ? <span>笔记 {b._count.annotations}</span> : null}
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-2">
                    <Progress value={b.epubPercent} />
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/books/${b.id}/file`}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-brand"
                      >
                        <Download className="size-3" />
                        下载
                      </a>
                      <Link
                        href={`/books/${b.id}`}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-brand"
                      >
                        <Search className="size-3" />
                        笔记
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
