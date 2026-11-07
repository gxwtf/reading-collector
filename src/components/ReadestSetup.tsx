"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

function Row({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-3 border-b border-border py-2 last:border-0">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <code className="flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs">{value}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          } catch {
            setDone(false);
          }
        }}
        className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:text-brand"
        aria-label={`复制${label}`}
      >
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

export function ReadestSetup({ webdavUser, webdavPass, syncUser, syncPass }: {
  webdavUser: string;
  webdavPass: string;
  syncUser: string;
  syncPass: string;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border p-4">
        <h2 className="mb-1 text-sm font-semibold">① 文件同步（WebDAV）</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          在阅读器里：设置 → 集成 → WebDAV，填入下面四项，根路径填 /
        </p>
        <Row label="服务器 URL" value="https://reading.gxwtf.cn/dav" />
        <Row label="用户名" value={webdavUser} />
        <Row label="密码" value={webdavPass} />
        <Row label="根路径" value="/" />
      </section>

      <section className="rounded-xl border border-border p-4">
        <h2 className="mb-1 text-sm font-semibold">② 笔记同步（Grimmory）</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          在阅读器里：设置 → 集成 → Grimmory，服务器 URL 不要带子路径
        </p>
        <Row label="服务器 URL" value="https://reading.gxwtf.cn" />
        <Row label="用户名" value={syncUser} />
        <Row label="密码" value={syncPass} />
      </section>

      <p className="text-xs text-muted-foreground">
        顺序：先连 ① 并「上传书籍文件」，再连 ② 同步笔记。书没上传时，笔记匹配不到对应的书。
      </p>

      <a
        href="/readest"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
      >
        打开阅读器
      </a>
    </div>
  );
}
