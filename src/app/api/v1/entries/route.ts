// 开放 API：给脚本/快捷指令/个人项目回灌链接
// 认证：Authorization: Bearer $SECRET_API_KEY
// POST { urls: string[], tags?: string[], collectionId?: number }
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { extractUrlsFromText, ingestUrls } from "@/lib/ingest";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const expected = process.env.SECRET_API_KEY ?? "";
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function apiUserId(): number {
  return Number(process.env.API_USER_ID ?? 0);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const userId = apiUserId();
  if (!userId) return Response.json({ error: "未配置 API_USER_ID" }, { status: 500 });

  const body = (await request.json().catch(() => null)) as {
    urls?: string[] | string;
    tags?: string[];
    collectionId?: number;
  } | null;

  const raw = Array.isArray(body?.urls) ? body!.urls.join("\n") : String(body?.urls ?? "");
  const urls = extractUrlsFromText(raw);
  if (urls.length === 0) return Response.json({ error: "没有可入库的链接" }, { status: 400 });

  const result = await ingestUrls({
    userId,
    urls,
    tags: (body?.tags ?? []).slice(0, 10),
    collectionId: body?.collectionId ?? null,
  });

  return Response.json({ ok: true, ...result, count: urls.length });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const userId = apiUserId();
  if (!userId) return Response.json({ error: "未配置 API_USER_ID" }, { status: 500 });

  const params = new URL(request.url).searchParams;
  const limit = Math.min(100, Number(params.get("limit") ?? 20));
  const q = (params.get("q") ?? "").trim().slice(0, 60);

  const entries = await prisma.entry.findMany({
    where: {
      userId,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { excerpt: { contains: q, mode: "insensitive" as const } },
              { contentMd: { contains: q, mode: "insensitive" as const } },
              { site: { contains: q, mode: "insensitive" as const } },
              { highlights: { some: { OR: [{ quote: { contains: q } }, { note: { contains: q } }] } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      url: true,
      site: true,
      kind: true,
      readState: true,
      state: true,
      createdAt: true,
    },
  });

  return Response.json({ entries });
}
