// 抓取队列：Python worker 轮询领取任务
// GET /api/worker/jobs?worker=<名字>   领取一条 pending 任务（原子领取）
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWorkerRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

type ClaimedJob = {
  id: number;
  entryId: number | null;
  url: string;
  kind: string;
  attempts: number;
};

/**
 * 回收卡死的任务。
 *
 * worker 崩溃 / 被 OOM 杀掉 / 回填请求打不通时，任务会永远停在 running：
 * claim 只捞 pending，全仓没有任何路径把 running 改回去。表现是用户页面上
 * 「抓取中」一直转，FetchProgress 因为 active>0 每 4 秒 router.refresh() 一次，
 * 永远到不了头，只能手动删了重收。
 *
 * worker 单个任务上限约 30 分钟（WORKER_TASK_TIMEOUT），这里留 2 小时余量，
 * 避免把正在跑的长视频转写误收。5 分钟最多扫一次，别让 5 秒一次的 claim 全表更新。
 */
const RECLAIM_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
let lastReclaimAt = 0;

async function reclaimStaleJobs(): Promise<void> {
  if (Date.now() - lastReclaimAt < RECLAIM_INTERVAL_MS) return;
  lastReclaimAt = Date.now();

  try {
    // 还有重试余量 → 放回队列，worker 会重新领
    const requeued = await prisma.$executeRaw`
      UPDATE "FetchJob"
         SET status = 'pending',
             "claimedAt" = NULL,
             worker = NULL,
             "updatedAt" = NOW(),
             error = '上次执行超时（worker 可能崩溃），已自动重新排队'
       WHERE status = 'running'
         AND "claimedAt" < NOW() - INTERVAL '2 hours'
         AND attempts < ${MAX_ATTEMPTS}
    `;

    // 重试用完 → 判失败，条目也标失败，页面给「重试」
    const dead = await prisma.$queryRaw<{ id: number; entryId: number | null }[]>`
      UPDATE "FetchJob"
         SET status = 'failed',
             "finishedAt" = NOW(),
             "updatedAt" = NOW(),
             error = '任务超时未回填（worker 可能崩溃），已放弃'
       WHERE status = 'running'
         AND "claimedAt" < NOW() - INTERVAL '2 hours'
         AND attempts >= ${MAX_ATTEMPTS}
       RETURNING id, "entryId"
    `;

    if (dead.length > 0) {
      const entryIds = dead.map((d) => d.entryId).filter((id): id is number => id !== null);
      if (entryIds.length > 0) {
        await prisma.entry.updateMany({
          where: { id: { in: entryIds }, state: "pending" },
          data: { state: "failed" },
        });
      }
    }

    if (requeued > 0 || dead.length > 0) {
      console.warn(`[reclaim] 重新排队 ${requeued} 条、判失败 ${dead.length} 条卡死任务`);
    }
  } catch (error) {
    // 回收失败不能影响正常领取
    console.error("[reclaim] 回收卡死任务失败", error);
  }
}

export async function GET(request: Request) {
  if (!verifyWorkerRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await reclaimStaleJobs();

  const worker = new URL(request.url).searchParams.get("worker") || "worker";

  // FOR UPDATE SKIP LOCKED：多个 worker 并发也不会领到同一条
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "FetchJob"
       SET status = 'running',
           attempts = attempts + 1,
           "claimedAt" = NOW(),
           "updatedAt" = NOW(),
           worker = ${worker}
     WHERE id = (
       SELECT id FROM "FetchJob"
        WHERE status = 'pending'
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
     RETURNING id, "entryId", url, kind, attempts
  `;

  if (rows.length === 0) {
    return NextResponse.json({ job: null });
  }

  const job = rows[0];

  // 把该条目所属用户的站点登录态一起下发，worker 按需注入环境变量
  let cookies: Record<string, string> = {};
  let existingTags: string[] = [];
  if (job.entryId) {
    const entry = await prisma.entry.findUnique({
      where: { id: job.entryId },
      select: {
        user: { select: { credentials: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    });
    const creds = (entry?.user?.credentials ?? {}) as Record<string, string>;
    const map: Record<string, string> = {
      zhihu: "ZHIHU_COOKIE",
      bilibili: "BILI_SESSDATA",
      weibo: "WEIBO_COOKIE",
      xiaohongshu: "XHS_COOKIE",
    };
    for (const [k, env] of Object.entries(map)) {
      const v = (creds[k] ?? "").trim();
      if (v) cookies[env] = v;
    }

    // 已用过的标签，让模型优先复用
    existingTags = (entry?.tags ?? []).map((t) => t.tag.name);
  }

  return NextResponse.json({ job: { ...job, cookies, existingTags } });
}
