import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { BookOpenText } from "lucide-react";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "登录" };

export default async function LoginPage() {
  const session = await getSession();
  if (session.isLoggedIn) redirect("/");

  const host = (await headers()).get("host") || "reading.gxwtf.cn";
  const ssoUrl = `/sso/login?system=${encodeURIComponent(host)}&back=${encodeURIComponent("/")}`;

  return (
    <div className="mx-auto max-w-sm space-y-6 py-16 text-center">
      <BookOpenText className="mx-auto size-10 text-brand-red" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">登录阅读收集</h1>
        <p className="text-sm text-muted-foreground">
          使用广学账号登录，收藏与阅读进度跟着账号走。
        </p>
      </div>
      <a
        href={ssoUrl}
        className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        使用广学账号登录
      </a>
      <p className="text-xs text-muted-foreground">
        还没有账号？前往 <a className="text-brand-red hover:underline" href="https://account.gxwtf.cn" target="_blank" rel="noreferrer">广学账号</a> 注册。
      </p>
    </div>
  );
}
