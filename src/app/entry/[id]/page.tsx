import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ExternalLink, RefreshCw, RotateCw } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { retryFetch } from "@/actions/entries";
import { addEntryToCollection, removeEntryFromCollection } from "@/actions/collections";
import { regenerateSummary } from "@/actions/summary";
import { getEmbed } from "@/lib/embed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReadingShell } from "@/components/ReadingShell";
import { HighlightLayer } from "@/components/HighlightLayer";
import { HighlightList } from "@/components/HighlightList";
import { VideoReader } from "@/components/VideoReader";

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

  const collections = await prisma.collection.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "asc" },
    include: { entries: { where: { entryId }, select: { id: true } } },
  });

  const body = entry.contentMd ?? "";
  const embed = getEmbed(entry.url, entry.kind);
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* 左栏：原文 / 播放器 / 逐字稿 */}
        <div className="min-w-0 space-y-6">
          {embed && entry.transcript ? (
            <VideoReader
              embed={embed}
              title={entry.title}
              backend={entry.transcript.backend}
              locale={entry.transcript.locale}
              segmentCount={
                Array.isArray(entry.transcript.segments) ? entry.transcript.segments.length : 0
              }
              lines={buildLines(entry.transcript.segments)}
            />
          ) : (
            <>
              {embed ? (
                <div className="sticky top-[4.25rem] z-20">
                  <div
                    className="overflow-hidden rounded-lg border border-border bg-muted shadow-lg"
                    style={{ aspectRatio: embed.ratio }}
                  >
                    <iframe
                      src={embed.base}
                      title={entry.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                      className="size-full"
                    />
                  </div>
                </div>
              ) : null}

              {entry.state === "pending" ? (
                <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                  正在后台抓取正文，稍后刷新即可。视频与播客需要先转写，可能要几分钟。
                </div>
              ) : null}

              {body ? (
                <ReadingShell>
                  <HighlightLayer
                    entryId={entry.id}
                    highlights={entry.highlights.map((h) => ({
                      id: h.id,
                      quote: h.quote,
                      note: h.note,
                      anchor: (h.anchor as { block?: number; start?: number; end?: number } | null) ?? null,
                    }))}
                  >
                    <div className="prose-reading max-w-none">
                      <MDXRemote
                        source={body}
                        options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
                      />
                    </div>
                  </HighlightLayer>
                </ReadingShell>
              ) : null}

              {entry.transcript ? (
                <ReadingShell>
                  <TranscriptView transcript={entry.transcript} />
                </ReadingShell>
              ) : null}
            </>
          )}
        </div>

        {/* 右栏：概括 + 划线批注 */}
        <aside className="space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-auto lg:pr-1">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">概括</h2>
              <form action={regenerateSummary.bind(null, entry.id)}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="size-3" />
                  重算
                </button>
              </form>
            </div>

            {entry.summary ? (
              <div className="summary-prose mt-2">
                <MDXRemote
                  source={entry.summary}
                  options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {entry.state === "pending" ? "抓取完成后自动生成。" : "还没有概括，点「重算」生成。"}
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium">划线批注（{entry.highlights.length}）</h2>
            <HighlightList
              items={entry.highlights.map((h) => ({
                id: h.id,
                quote: h.quote,
                note: h.note,
                anchor: (h.anchor as { block?: number; start?: number; end?: number } | null) ?? null,
                createdAt: h.createdAt.toLocaleDateString("zh-CN"),
              }))}
            />
          </section>

          {collections.length > 0 ? (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-medium">分组</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {collections.map((c) => {
                  const inGroup = c.entries.length > 0;
                  return (
                    <form
                      key={c.id}
                      action={
                        inGroup
                          ? removeEntryFromCollection.bind(null, entry.id, c.id)
                          : addEntryToCollection.bind(null, entry.id, c.id)
                      }
                    >
                      <button
                        type="submit"
                        className={
                          inGroup
                            ? "rounded-full border border-brand-red/40 bg-brand-red/10 px-2.5 py-0.5 text-xs text-brand-red"
                            : "rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                        }
                      >
                        {inGroup ? `✓ ${c.name}` : `+ ${c.name}`}
                      </button>
                    </form>
                  );
                })}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </article>
  );
}

type TranscriptSegment = { start?: number; end?: number; text?: string };

function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 逐字稿：按 60 秒聚合成段，带时间戳；没有分段时退回纯文本 */
function TranscriptView({
  transcript,
}: {
  transcript: { backend: string; locale: string; text: string; segments: unknown };
}) {
  const raw = Array.isArray(transcript.segments) ? (transcript.segments as TranscriptSegment[]) : [];
  const segments = raw.filter((s) => (s.text ?? "").trim().length > 0);

  const chunks: { start: number; text: string }[] = [];
  for (const seg of segments) {
    const start = Number(seg.start ?? 0);
    const text = (seg.text ?? "").trim();
    const last = chunks[chunks.length - 1];
    if (last && start - last.start < 60) {
      last.text += text.startsWith(" ") || /^[a-zA-Z]/.test(text) ? ` ${text}` : text;
    } else {
      chunks.push({ start, text });
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">逐字稿</h2>
        <span className="text-xs text-muted-foreground">
          {transcript.backend} · {transcript.locale} · {segments.length} 段
        </span>
      </div>

      {chunks.length > 0 ? (
        <div className="space-y-4 text-[15px] leading-8">
          {chunks.map((c) => (
            <div key={c.start} className="flex gap-3">
              <span className="w-11 shrink-0 pt-1 text-xs tabular-nums text-muted-foreground">
                {mmss(c.start)}
              </span>
              <p className="min-w-0 flex-1">{c.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
          {transcript.text}
        </pre>
      )}
    </section>
  );
}

type SegLike = { start?: number; end?: number; text?: string };

/**
 * 逐字稿切成「歌词行」：相邻小段合并到 ≥8 秒或 ≥48 字，
 * 行高亮比逐字更稳，也更像 Apple Music 的滚动歌词。
 */
function buildLines(raw: unknown): { start: number; end: number; text: string }[] {
  const segments = Array.isArray(raw) ? (raw as SegLike[]) : [];
  const lines: { start: number; end: number; text: string }[] = [];

  for (const seg of segments) {
    const start = Number(seg.start ?? 0);
    const end = Number(seg.end ?? start);
    const text = (seg.text ?? "").trim();
    if (!text) continue;

    const last = lines[lines.length - 1];
    if (last && end - last.start <= 9 && last.text.length + text.length <= 64) {
      last.text += text.startsWith(" ") || /^[a-zA-Z]/.test(text) ? ` ${text}` : text;
      last.end = end;
    } else {
      lines.push({ start, end, text });
    }
  }

  return lines;
}
