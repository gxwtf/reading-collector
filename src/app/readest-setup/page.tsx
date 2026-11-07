import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ReadestSetup } from "@/components/ReadestSetup";

export const metadata: Metadata = { title: "阅读器同步设置 · 阅读收集" };
export const dynamic = "force-dynamic";

export default function ReadestSetupPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/books" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand">
        <ArrowLeft className="size-3.5" />
        书库
      </Link>
      <div>
        <h1 className="text-lg font-semibold">阅读器同步设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          自建阅读器（网页版 / 本地版）连到这台服务器，书和笔记都留在这里。
        </p>
      </div>
      <ReadestSetup
        webdavUser={process.env.WEBDAV_USER || "reader"}
        webdavPass={process.env.WEBDAV_PASSWORD || ""}
        syncUser={process.env.READEST_USER || "readest"}
        syncPass={process.env.READEST_PASSWORD || ""}
      />
    </div>
  );
}
