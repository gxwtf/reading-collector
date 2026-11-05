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

export async function GET(request: Request) {
  if (!verifyWorkerRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json({ job: rows[0] });
}
