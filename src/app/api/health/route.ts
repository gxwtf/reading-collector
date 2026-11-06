// 健康检查：DB 是否能查、进程信息
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({
      ok: true,
      db: "up",
      latencyMs: Date.now() - started,
      uptimeSec: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? "0.1.0",
    });
  } catch (error) {
    return Response.json(
      { ok: false, db: "down", error: (error as Error).message.slice(0, 200) },
      { status: 503 },
    );
  }
}
