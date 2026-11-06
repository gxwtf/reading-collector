// worker 回填结果：POST /api/worker/jobs/<id>
// body: { status: "done" | "failed", error?, entry?: {...}, transcript?: {...} }
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { verifyWorkerRequest } from "@/lib/session";

type JobResult = {
  status: "done" | "failed";
  error?: string;
  entry?: {
    title?: string;
    site?: string;
    author?: string;
    lang?: string;
    excerpt?: string;
    contentMd?: string;
    summary?: string;
    coverImage?: string;
    wordCount?: number;
    durationSec?: number;
    publishedAt?: string;
    kind?: string;
  };
  transcript?: {
    locale: string;
    backend: string;
    model?: string;
    text: string;
    segments?: unknown;
  };
};

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyWorkerRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: "bad job id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as JobResult | null;
  if (!body || (body.status !== "done" && body.status !== "failed")) {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const job = await prisma.fetchJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });

  try {
    if (body.status === "failed") {
      await prisma.fetchJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          error: (body.error || "未知错误").slice(0, 2000),
          finishedAt: new Date(),
        },
      });
      if (job.entryId) {
        await prisma.entry.update({
          where: { id: job.entryId },
          data: { state: "failed" },
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (job.entryId && body.entry) {
      const entry = body.entry;
      await prisma.entry.update({
        where: { id: job.entryId },
        data: {
          state: "ready",
          ...(entry.title ? { title: entry.title.slice(0, 500) } : {}),
          ...(entry.site ? { site: entry.site.slice(0, 100) } : {}),
          ...(entry.author ? { author: entry.author.slice(0, 200) } : {}),
          ...(entry.lang ? { lang: entry.lang.slice(0, 20) } : {}),
          ...(entry.excerpt ? { excerpt: entry.excerpt } : {}),
          ...(entry.contentMd ? { contentMd: entry.contentMd } : {}),
          ...(entry.summary ? { summary: entry.summary } : {}),
          ...(entry.coverImage ? { coverImage: entry.coverImage.slice(0, 2048) } : {}),
          ...(typeof entry.wordCount === "number" ? { wordCount: entry.wordCount } : {}),
          ...(typeof entry.durationSec === "number" ? { durationSec: entry.durationSec } : {}),
          ...(entry.kind ? { kind: entry.kind } : {}),
          ...(entry.publishedAt ? { publishedAt: new Date(entry.publishedAt) } : {}),
        },
      });
    }

    if (job.entryId && body.transcript) {
      const t = body.transcript;
      await prisma.transcript.upsert({
        where: { entryId: job.entryId },
        update: {
          locale: t.locale,
          backend: t.backend,
          model: t.model || null,
          text: t.text,
          segments: t.segments == null ? Prisma.JsonNull : (t.segments as Prisma.InputJsonValue),
        },
        create: {
          entryId: job.entryId,
          locale: t.locale,
          backend: t.backend,
          model: t.model || null,
          text: t.text,
          segments: t.segments == null ? Prisma.JsonNull : (t.segments as Prisma.InputJsonValue),
        },
      });
    }

    await prisma.fetchJob.update({
      where: { id: jobId },
      data: { status: "done", error: null, finishedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("worker result failed", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
