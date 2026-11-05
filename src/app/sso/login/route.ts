// SSO 入口：/sso/login?system=<host>&back=<原路径>
// 与广坊其他站点一致，302 到广学账号中心
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  const system = url.searchParams.get("system") || host;
  const back = url.searchParams.get("back") || "/";

  const account = process.env.GXACCOUNT_URL || "https://account.gxwtf.cn";
  const target = `${account}/sso/login?system=${encodeURIComponent(system)}&back=${encodeURIComponent(back)}`;

  return NextResponse.redirect(target, 302);
}
