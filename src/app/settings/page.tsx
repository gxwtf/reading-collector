import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { systemConfig, systemConfigs } from "@/lib/llm";
import { AiSettingsForm } from "@/components/AiSettingsForm";
import { PreciseVideoToggle } from "@/components/PreciseVideoToggle";
import { UserAvatar } from "@/components/UserAvatar";
import { CredentialsForm } from "@/components/CredentialsForm";

export const metadata: Metadata = { title: "设置" };

type Stored = { mode?: "system" | "custom"; apiBase?: string; apiKey?: string; model?: string };

export default async function SettingsPage() {
  const session = await requireSession("/settings");
  const dav = await import("@/lib/dav-users").then((m) => m.ensureDavUser(session.userId));

  const user = await prisma.user.findUnique({
    where: { userId: session.userId },
    select: { aiSettings: true, prefs: true, credentials: true },
  });
  const stored = (user?.aiSettings ?? {}) as Stored;
  const prefs = (user?.prefs ?? {}) as { preciseVideo?: boolean };
  const creds = (user?.credentials ?? {}) as Record<string, string>;
  const configured = {
    zhihu: Boolean(creds.zhihu),
    bilibili: Boolean(creds.bilibili),
    weibo: Boolean(creds.weibo),
    xiaohongshu: Boolean(creds.xiaohongshu),
  };
  const system = systemConfig();
  const systemKeyCount = systemConfigs().length;

  const mode: "system" | "custom" =
    stored.apiBase && stored.apiKey && stored.model ? "custom" : "system";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        返回列表
      </Link>

      <div>
        <h1 className="text-xl font-semibold">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          用哪个模型来生成概括，由你决定。
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-medium">概括用的模型</h2>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          不填就用站点默认；填了就走你自己的接口，调用量与费用都在你自己的账号下。
        </p>

        <AiSettingsForm
          initialMode={mode}
          initialApiBase={stored.apiBase ?? ""}
          initialModel={stored.model ?? ""}
          hasKey={Boolean(stored.apiKey)}
          systemModel={system?.model ?? null}
          systemKeyCount={systemKeyCount}
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-medium">站点登录态</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          知乎、B 站官方字幕、微博、小红书需要登录态。填一次即可，之后这些站点的链接会自动带上。
        </p>
        <div className="mt-3">
          <CredentialsForm configured={configured} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-medium">视频</h2>
        <div className="mt-3">
          <PreciseVideoToggle initial={Boolean(prefs.preciseVideo)} />
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-medium">书库同步（WebDAV）</h2>
        <p className="text-xs text-muted-foreground">
          这个账号专属的书库目录。在 Readest 里填下面三项，就能把书和笔记同步到自己的空间。
        </p>
        <div className="space-y-1 rounded-lg border border-border p-3 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">服务器</span>
            <code className="truncate">https://reading.gxwtf.cn/dav/{dav.username}/</code>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">用户名</span>
            <code>{dav.username}</code>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">密码</span>
            <code>{dav.password}</code>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Readest → 设置 → 集成 → WebDAV，根路径留空（服务器地址已含用户名）。
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <h2 className="text-sm font-medium text-foreground">当前账号</h2>
        <p className="mt-2">广学账号：{session.userName ?? "—"}</p>
        <p>用户 ID：{session.userId}</p>
      </section>
    </div>
  );
}
