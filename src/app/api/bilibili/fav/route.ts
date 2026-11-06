import type { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { fetchFavPage, parseMediaId } from "@/lib/bilibili";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) return Response.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const mediaId = parseMediaId(params.get("mediaId") ?? "");
  if (!mediaId) return Response.json({ error: "请填收藏夹链接或 media_id" }, { status: 400 });

  const page = Number(params.get("page") ?? 1) || 1;
  try {
    const data = await fetchFavPage(mediaId, page);
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
