import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ExternalLink, RotateCw } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { retryFetch } from "@/actions/entries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Params = Promise<{ id: string }>;

async function loadEntry(id: number, userId: number) {
  return prisma.entry.findFirst({
    where: { id, userId },
    include: {
      tags: { include: { tag: true } },
      transcript: true,
      highlights: { orderBy: { createdAt: "desc" } },
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const session = await requireSession(`/entry/${id}`);
  const entry = await loadEntry(Number(id), session.userId);
  return { title: entry?.title ?? "条目" };
}

export default async function EntryPage({ params }: { params: Params }) {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId)) notFound();

  const session = await requireSession(`/entry/${entryId}`);
  const entry = await loadEntry(entryId, session.userId);
  if (!entry) notFound();

  const body = entry.contentMd ?? "";

  const lastJob = entry.jobs[0];

  return (
    <article className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回列表
        </Link>
        <a
          href={entry.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          原文
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold leading-snug">{entry.title}</h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {entry.site ? <span>{entry.site}</span> : null}
          {entry.author ? <span>{entry.author}</span> : null}
          {entry.wordCount ? <span>{entry.wordCount} 字</span> : null}
          <span>收藏于 {entry.createdAt.toLocaleDateString("zh-CN")}</span>
        </p>
        {entry.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {entry.tags.map((t) => (
              <Badge key={t.tagId} variant="secondary" className="font-normal">
                {t.tag.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </header>

      {entry.state === "pending" ? (
        <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
          正在后台抓取正文，稍后刷新即可。视频与播客需要先转写，可能要几分钟。
        </div>
      ) : null}

      {entry.state === "failed" ? (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">抓取失败{lastJob?.error ? `：${lastJob.error}` : ""}</p>
          <form action={retryFetch.bind(null, entry.id)}>
            <Button type="submit" variant="outline" size="sm">
              <RotateCw className="size-3.5" />
              重试
            </Button>
          </form>
        </div>
      ) : null}

      {body ? (
        <div className="prose-reading max-w-none text-[15px] leading-7">
          <MDXRemote
            source={body}
            options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
          />
        </div>
      ) : null}

      {entry.transcript ? (
        <section className="space-y-2 border-t border-border pt-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            逐字稿（{entry.transcript.backend} · {entry.transcript.locale}）
          </h2>
          <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
            {entry.transcript.text}
          </pre>
        </section>
      ) : null}
    </article>
  );
}
