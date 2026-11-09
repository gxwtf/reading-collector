// SSO 回调：广学账号带 token 回到 <host>/sso/callback?token=…&back=…
// 校验 token → upsert 用户 → 写 iron-session → 跳回原页面
import path from "node:path";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/iron";
import { prisma } from "@/lib/db";

type VerifyResponse = {
  userId: number;
  userName?: string;
  admin?: number | boolean;
  userRealName?: string;
  userEmail?: string;
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const back = url.searchParams.get("back") || "/";
  const host = request.headers.get("host") || url.host;
  const origin = `${url.protocol}//${host}`;
  const account = process.env.GXACCOUNT_URL || "https://account.gxwtf.cn";

  const fail = (message: string) =>
    NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`,
      302,
    );

  if (!token) return fail("缺少登录令牌");

  try {
    const res = await fetch(`${account}/sso/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });

    if (!res.ok) return fail("单点登录失败，请重试");

    const data = (await res.json()) as VerifyResponse & { success?: boolean };
    if (!data?.userId) return fail("单点登录返回的用户无效");

    const userName = data.userName || `用户${data.userId}`;
    const admin = data.admin === true || data.admin === 1 ? 1 : 0;

    await prisma.user.upsert({
      where: { userId: data.userId },
      update: {
        userName,
        admin,
        email: data.userEmail || null,
        realName: data.userRealName || null,
      },
      create: {
        userId: data.userId,
        userName,
        admin,
        email: data.userEmail || null,
        realName: data.userRealName || null,
      },
    });

    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.isLoggedIn = true;
    session.userId = data.userId;

    // 每个广学账号都给一份书库与 DAV 凭据
    try {
      const { mkdir } = await import("node:fs/promises");
      const { davRoot, ensureDavUser } = await import("@/lib/dav-users");
      await mkdir(path.join(davRoot(data.userId), "covers"), { recursive: true });
      await ensureDavUser(data.userId);
    } catch {
      /* 失败不影响登录 */
    }
    session.userName = userName;
    session.admin = admin;
    session.email = data.userEmail || "";
    session.realName = data.userRealName || "";
    await session.save();

    return NextResponse.redirect(`${origin}${back.startsWith("/") ? back : "/"}`, 302);
  } catch (error) {
    console.error("sso callback failed", error);
    return fail("单点登录异常，请稍后再试");
  }
}
