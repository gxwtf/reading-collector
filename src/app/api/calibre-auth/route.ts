import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * nginx auth_request 子请求：校验广学登录态，把用户名通过响应头交给 Calibre-Web。
 * 未登录返回 401，nginx 直接拒绝访问 /calibre/。
 */
export async function GET() {
  const session = await getSession();
  if (!session.userId) return new Response("unauthorized", { status: 401 });
  return new Response("ok", {
    status: 200,
    headers: { "X-Reader-User": `u${session.userId}` },
  });
}
