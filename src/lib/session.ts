import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { defaultSession, sessionOptions, type SessionData } from "@/lib/iron";

/** 读会话；未登录返回默认（未登录）会话，不抛错 */
export async function getSession(): Promise<SessionData> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  return { ...defaultSession, ...session };
}

/** 读会话；未登录直接跳登录页 */
export async function requireSession(back = "/"): Promise<SessionData & { userId: number }> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    redirect(`/login?back=${encodeURIComponent(back)}`);
  }
  return session as SessionData & { userId: number };
}

/** worker 回调校验：Authorization: Bearer $INTERNAL_API_KEY */
export function verifyWorkerRequest(request: Request): boolean {
  const expected = process.env.INTERNAL_API_KEY || "";
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token.length !== expected.length) return false;
  // 定长比较，避免时序侧信道
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
