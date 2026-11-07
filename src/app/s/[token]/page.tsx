import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { getEmbed, seekUrl } from "@/lib/embed";

type Params = Promise<{ token: string }>;

export const metadata: Metadata = {
  title: "分享的文章",
  robots: { index: false, follow: false },
};

/** 只读分享页：不需要登录；文章给正文，视频给播放器 + 逐字稿 */
export default async function SharedPage({ params }: { params: Params }) {
  const { token } = await params;
  const entry = await prisma.entry.findUnique({
    where: { shareToken: token },
    select: {
      title: true,
      site: true,
      url: true,
      kind: true,
      summary: true,
      contentMd: true,
      createdAt: true,
      transcript: { select: { text: true } },
    },
  });
  if (!entry) notFound();

  const embed = getEmbed(entry.url, entry.kind);
  const paragraphs = (entry.transcript?.text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 200);

  return (
    <article className="mx-auto max-w-3xl space-y-5 py-8">
      <header className="space-y-2 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold leading-snug">{entry.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{entry.site ?? ""}</span>
          <span>分享于 {entry.createdAt.toLocaleDateString("zh-CN")}</span>
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-brand hover:underline"
          >
            原文
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </header>

      {embed ? (
        <div
          className="overflow-hidden rounded-xl border border-border bg-black"
          style={{ aspectRatio: embed.ratio }}
        >
          <iframe
            src={seekUrl(embed, 0).replace("autoplay=1", "autoplay=0")}
            title={entry.title}
            allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            className="size-full"
          />
        </div>
      ) : null}

      {entry.summary ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">概括</h2>
          <div className="summary-prose text-sm leading-6">
            <MDXRemote source={entry.summary} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
          </div>
        </section>
      ) : null}

      {entry.contentMd ? (
        <div className="prose-reading max-w-none">
          <MDXRemote source={entry.contentMd} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
        </div>
      ) : paragraphs.length > 0 ? (
        <section className="prose-reading max-w-none space-y-3 text-[15px] leading-7">
          <h2 className="text-sm font-medium text-muted-foreground">逐字稿</h2>
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">这篇还没有可读正文，点上面的「原文」查看。</p>
      )}

      <footer className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
        由 广学五题坊 · <Link href="/" className="underline">阅读收集</Link> 分享
      </footer>
    </article>
  );
}
