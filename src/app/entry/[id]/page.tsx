import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ExternalLink, RotateCw } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { retryFetch } from "@/actions/entries";
import { addEntryToCollection, removeEntryFromCollection } from "@/actions/collections";
import { regenerateSummary } from "@/actions/summary";
import { ShareMenu } from "@/components/ShareMenu";
import { RegenerateButton } from "@/components/RegenerateButton";
import { getEmbed } from "@/lib/embed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReadingShell } from "@/components/ReadingShell";
import { HighlightLayer } from "@/components/HighlightLayer";
import { HighlightList } from "@/components/HighlightList";
import { VideoReader } from "@/components/VideoReader";
import { mmss } from "@/lib/time";
import { PrepareVideo } from "@/components/PrepareVideo";
import { SummaryPanel } from "@/components/SummaryPanel";
import { MarkdownImage } from "@/components/MarkdownImage";
import { SearchHighlight } from "@/components/SearchHighlight";
import { MemoOutline } from "@/components/MemoOutline";
import { extractOutline } from "@/lib/outline";
import { kindLabel } from "@/lib/kind";

type Params = Promise<{ id: string }>;
type Search = Promise<{ only?: string; q?: string }>;

function toSeconds(stamp: string): number {
  const parts = stamp.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

/** 把概括里的 [mm:ss] 变成可点击锚点（#t=秒），由 VideoReader 接管跳转 */
function linkTimestamps(md: string): string {
  return md.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (_m, stamp: string) =>
    `[${stamp}](#t=${toSeconds(stamp)})`,
  );
}

async function loadEntry(id: number, userId: number) {
  return prisma.entry.findFirst({
    where: { id, userId },
    include: {
      tags: { include: { tag: true } },
      transcript: true,
      highlights: { orderBy: { createdAt: "desc" } },
      keyframes: { orderBy: { timeSec: "asc" } },
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

export default async function EntryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId)) notFound();

  const sp = await searchParams;
  const onlySummary = sp.only === "summary";
  // 从列表搜索进来时带上 q，正文里命中处高亮。限 60 字，与列表页同一口径
  const searchQuery = (sp.q ?? "").trim().slice(0, 60);

  const session = await requireSession(`/entry/${entryId}`);
  const entry = await loadEntry(entryId, session.userId);
  if (!entry) notFound();

  const collections = await prisma.collection.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "asc" },
    include: { entries: { where: { entryId }, select: { id: true } } },
  });

  const body = entry.contentMd ?? "";
  const outline = extractOutline(body);
  const embed = getEmbed(entry.url, entry.kind);
  const lastJob = entry.jobs[0];

  const prefs = (await prisma.user.findUnique({
    where: { userId: session.userId },
    select: { prefs: true },
  }))?.prefs as { preciseVideo?: boolean } | null;
  const preciseReady = Boolean(prefs?.preciseVideo) && entry.mediaState === "ready";
  const preciseEnabled = Boolean(prefs?.preciseVideo);

  return (
    <article className="mx-auto w-full max-w-[1180px] space-y-7">
      {/* 顶部一行打包：返回 + 正文操作。横屏（高度只有 768）时这段每省一行，正文就多露一截 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[14px] text-ink-2 transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          返回全部收藏
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={onlySummary ? `/entry/${entry.id}` : `/entry/${entry.id}?only=summary`}
            className="inline-flex items-center rounded-xl border border-hairline px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-hairline-dashed hover:text-ink"
          >
            {onlySummary ? "显示原文" : "只看概括"}
          </Link>
          <ShareMenu
            entryId={entry.id}
            token={entry.shareToken}
            title={entry.title}
            site={entry.site ?? ""}
            text={(entry.summary ?? "")
              .replace(/\s+/g, " ")
              .replace(/[#>*_`[\]]/g, "")
              .trim()
              .slice(0, 260)}
          />
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink"
          >
            原文
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      <header className="max-w-[820px] space-y-3">
        <p className="text-[13px] font-medium text-brand-strong">
          {[kindLabel(entry.kind), entry.site, entry.author].filter(Boolean).join(" · ")}
        </p>
        {/* break-words + overflow-wrap:anywhere：标题常常是一条 URL（抓取失败时
            title 直接取链接），没有空格的超长串会把整页撑出横向滚动。 */}
        <h1 className="font-serif text-[28px] font-semibold leading-[1.3] text-ink break-words [overflow-wrap:anywhere] md:text-[40px]">
          {entry.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-3">
          {entry.wordCount ? <span>{entry.wordCount} 字</span> : null}
          {entry.durationSec ? <span>{Math.round(entry.durationSec / 60)} 分钟</span> : null}
          <span>收藏于 {entry.createdAt.toLocaleDateString("zh-CN")}</span>
          {entry.tags.map((t) => (
            <span key={t.tagId} className="rounded-full bg-paper-muted px-2.5 py-[3px] text-[12px] text-ink-2">
              {t.tag.name}
            </span>
          ))}
        </div>
      </header>

      {entry.state === "failed" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-[14px]">
          <p className="text-destructive">抓取失败{lastJob?.error ? `：${lastJob.error}` : ""}</p>
          <form action={retryFetch.bind(null, entry.id)}>
            <Button type="submit" variant="outline" size="sm">
              <RotateCw className="size-3.5" />
              重试
            </Button>
          </form>
        </div>
      ) : null}

      <div className={onlySummary ? "grid gap-6" : "grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]"}>
        {/* 左栏：原文 / 播放器 / 逐字稿。小屏时顺序调到右栏之后（§6：概括置于正文之前） */}
        <div className={onlySummary ? "hidden" : "order-2 min-w-0 space-y-6 lg:order-1"}>
          {embed && entry.transcript && preciseEnabled && entry.mediaState !== "ready" ? (
            <PrepareVideo entryId={entry.id} state={entry.mediaState} />
          ) : null}

          {embed ? (
            <VideoReader
              embed={embed}
              title={entry.title}
              entryId={entry.id}
              backend={entry.transcript?.backend ?? "pending"}
              locale={entry.transcript?.locale ?? ""}
              segmentCount={
                Array.isArray(entry.transcript?.segments) ? entry.transcript!.segments.length : 0
              }
              lines={entry.transcript ? buildLines(entry.transcript.segments) : []}
              precise={preciseReady}
              keyframes={entry.keyframes.map((k) => ({
                id: k.id,
                timeSec: k.timeSec,
                note: k.note,
              }))}
            />
          ) : (
            <>

              {entry.state === "pending" ? (
                <div className="rounded-xl border border-hairline bg-paper-muted/60 p-4 text-[14px] text-ink-2">
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
                      <SearchHighlight query={searchQuery}>
                        <MDXRemote
                          source={body}
                          options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
                          components={{ img: MarkdownImage }}
                        />
                      </SearchHighlight>
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

        {/* 右栏：AI 概括（§4.5 要求概括在前）+ 目录 + 划线批注 + 分组。
            小屏 order-1 让它排在正文之前。 */}
        <aside className="order-1 space-y-5 lg:order-2 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-auto lg:pr-1">
          <section className="rounded-2xl border border-hairline bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-[18px] font-semibold text-ink">AI 概括</h2>
              <RegenerateButton action={regenerateSummary.bind(null, entry.id)} />
            </div>

            {entry.summary ? (
              <SummaryPanel
                markdown={entry.summary}
                seekable={entry.kind === "video" || entry.kind === "podcast"}
              />
            ) : (
              <p className="mt-3 text-[14px] leading-[1.7] text-ink-2">
                {entry.state === "pending" ? "抓取完成后自动生成。" : "还没有概括，点「重算」生成。"}
              </p>
            )}

            {/* §4.5 的两个按钮：生成小图（陶土实底）/ 打开原文（虚线描边） */}
            <div className="mt-5 flex flex-col gap-3">
              <ShareMenu
                entryId={entry.id}
                token={entry.shareToken}
                title={entry.title}
                site={entry.site ?? ""}
                text={(entry.summary ?? "")
                  .replace(/\s+/g, " ")
                  .replace(/[#>*_`[\]]/g, "")
                  .trim()
                  .slice(0, 260)}
                variant="primary"
              />
              <a
                href={entry.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-hairline-dashed text-[15px] text-ink transition-colors hover:bg-paper-muted/50"
              >
                打开原文
              </a>
            </div>
          </section>

          {/* 没有标题就不渲染，避免留一个空框 */}
          {outline.length >= 2 ? (
            <section className="rounded-2xl border border-hairline bg-card p-4">
              <h2 className="mb-2 text-[14px] text-ink-3">目录</h2>
              <MemoOutline headings={outline} />
            </section>
          ) : null}

          <section className="space-y-3 rounded-2xl border border-hairline bg-card p-4">
            <h2 className="text-[14px] text-ink-3">划线批注（{entry.highlights.length}）</h2>
            <HighlightList
              entryUrl={
                entry.shareToken
                  ? `https://reading.gxwtf.cn/s/${entry.shareToken}`
                  : `https://reading.gxwtf.cn/entry/${entry.id}`
              }
              entryTitle={entry.title}
              entrySite={entry.site}
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
            <section className="rounded-2xl border border-hairline bg-card p-4">
              <h2 className="text-[14px] text-ink-3">分组</h2>
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
                            ? "rounded-full bg-brand-soft px-2.5 py-1 text-[12px] text-brand-strong"
                            : "rounded-full border border-hairline px-2.5 py-1 text-[12px] text-ink-2 transition-colors hover:text-ink"
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


type SegLike = {
  start?: number;
  end?: number;
  text?: string;
  words?: { start?: number; end?: number; text?: string }[];
};

/** 逐字稿切成「歌词行」：按词累积，遇到句末标点 / 满 48 字 / 超过 7 秒就断行 */
function buildLines(raw: unknown): { start: number; end: number; text: string }[] {
  const segments = Array.isArray(raw) ? (raw as SegLike[]) : [];
  const lines: { start: number; end: number; text: string }[] = [];

  let cur: { start: number; end: number; text: string } | null = null;
  const flush = () => {
    if (cur && cur.text.trim()) lines.push({ ...cur, text: cur.text.trim() });
    cur = null;
  };

  for (const seg of segments) {
    const segStart = Number(seg.start ?? 0);
    const segEnd = Number(seg.end ?? segStart);
    const words =
      seg.words && seg.words.length > 0
        ? seg.words.map((w) => ({
            start: Number(w.start ?? segStart),
            end: Number(w.end ?? segEnd),
            text: w.text ?? "",
          }))
        : [{ start: segStart, end: segEnd, text: " " + (seg.text ?? "") }];

    for (const w of words) {
      if (!cur) cur = { start: w.start, end: w.end, text: "" };
      cur.text += w.text;
      cur.end = w.end;

      const dur = cur.end - cur.start;
      const endsSentence = /[。！？.!?]/.test(w.text.trim().slice(-1));
      if (endsSentence || dur >= 7 || cur.text.trim().length >= 48) flush();
    }

    if (cur && cur.end - cur.start > 9) flush();
  }
  flush();

  return lines;
}

/** 兜底：没有可嵌入播放器时，按 60 秒聚合的纯文本逐字稿 */
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
