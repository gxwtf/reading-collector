import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { systemConfig, systemConfigs } from "@/lib/llm";
import { AiSettingsForm } from "@/components/AiSettingsForm";

export const metadata: Metadata = { title: "设置" };

type Stored = { mode?: "system" | "custom"; apiBase?: string; apiKey?: string; model?: string };

export default async function SettingsPage() {
  const session = await requireSession("/settings");

  const user = await prisma.user.findUnique({
    where: { userId: session.userId },
    select: { aiSettings: true },
  });
  const stored = (user?.aiSettings ?? {}) as Stored;
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

      <section className="rounded-lg border border-border bg-card p-5">
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

      <section className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        <h2 className="text-sm font-medium text-foreground">当前账号</h2>
        <p className="mt-2">广学账号：{session.userName ?? "—"}</p>
        <p>用户 ID：{session.userId}</p>
      </section>
    </div>
  );
}
