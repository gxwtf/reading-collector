import type { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { fetchCollection } from "@/lib/bilibili";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url).searchParams.get("url") ?? "";
  if (!url.trim()) return Response.json({ error: "请粘贴视频链接" }, { status: 400 });

  try {
    return Response.json(await fetchCollection(url));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
