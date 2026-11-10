import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const CALIBRE = "http://127.0.0.1:8083";
const USER = process.env.CALIBRE_USER || "admin";
const PASS = process.env.CALIBRE_PASSWORD || "";

/** 用服务端账号登录 Calibre-Web，把它的 session cookie 转给浏览器，实现免登录。 */
export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.redirect("https://reading.gxwtf.cn/login?back=/calibre/");
  }

  const loginPage = await fetch(`${CALIBRE}/login`, { cache: "no-store" });
  const html = await loginPage.text();
  const jar = (loginPage.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const token = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1] ?? "";
  if (!token) return NextResponse.redirect("https://reading.gxwtf.cn/calibre/");

  const body = new URLSearchParams({
    csrf_token: token,
    username: USER,
    password: PASS,
    remember_me: "on",
  });

  const res = await fetch(`${CALIBRE}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar,
      "X-Script-Name": "/calibre",
    },
    body,
    redirect: "manual",
  });

  const out = NextResponse.redirect("https://reading.gxwtf.cn/calibre/");
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const [name, value] = pair.split("=");
    if (!name || !value) continue;
    out.cookies.set(name.trim(), value, { path: "/", sameSite: "lax" });
  }
  return out;
}
