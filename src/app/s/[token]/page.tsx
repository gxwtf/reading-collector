import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { prisma } from "@/lib/db";

type Params = Promise<{ token: string }>;

export const metadata: Metadata = { title: "分享的文章" };

/** 只读分享页：不需要登录，只展示标题、概括与正文 */
export default async function SharedPage({ params }: { params: Params }) {
  const { token } = await params;
  const entry = await prisma.entry.findUnique({
    where: { shareToken: token },
    select: { title: true, site: true, summary: true, contentMd: true, createdAt: true },
  });
  if (!entry) notFound();

  return (
    <article className="mx-auto max-w-3xl space-y-4 py-8">
      <header className="space-y-2 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold leading-snug">{entry.title}</h1>
        <p className="text-sm text-muted-foreground">
          {entry.site ?? ""} · 分享于 {entry.createdAt.toLocaleDateString("zh-CN")}
        </p>
      </header>

      {entry.summary ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="prose-reading text-sm">
            <MDXRemote source={entry.summary} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
          </div>
        </section>
      ) : null}

      {entry.contentMd ? (
        <div className="prose-reading max-w-none">
          <MDXRemote source={entry.contentMd} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">这篇还没有可读正文。</p>
      )}

      <p className="pt-6 text-center text-xs text-muted-foreground">
        由 广学五题坊 · 阅读收集 分享 · <a className="underline" href="/">reading.gxwtf.cn</a>
      </p>
    </article>
  );
}
