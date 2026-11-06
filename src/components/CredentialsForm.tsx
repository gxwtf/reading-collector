"use client";

import { useActionState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { saveCredentials, type CredentialState } from "@/actions/credentials";

const SITES = [
  {
    key: "zhihu",
    label: "知乎",
    hint: "整条 Cookie（含 z_c0）",
    placeholder: "z_c0=...; d_c0=...",
  },
  {
    key: "bilibili",
    label: "B 站",
    hint: "SESSDATA 的值（用于官方字幕）",
    placeholder: "SESSDATA 的值",
  },
  {
    key: "weibo",
    label: "微博",
    hint: "整条 Cookie（含 SUB）",
    placeholder: "SUB=...",
  },
  {
    key: "xiaohongshu",
    label: "小红书",
    hint: "整条 Cookie（含 web_session）",
    placeholder: "web_session=...",
  },
] as const;

const initial: CredentialState = { ok: false };

export function CredentialsForm({ configured }: { configured: Record<string, boolean> }) {
  const [state, action, pending] = useActionState(saveCredentials, initial);

  return (
    <form action={action} className="space-y-3">
      {SITES.map((s) => {
        const has = configured[s.key];
        return (
          <div key={s.key} className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{s.label}</span>
              {has ? (
                <span className="inline-flex items-center gap-1 text-xs text-brand">
                  <ShieldCheck className="size-3.5" />
                  已配置
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">未配置</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{s.hint}</span>
            </div>
            <input
              name={s.key}
              type="password"
              autoComplete="off"
              defaultValue={has ? "keep" : ""}
              placeholder={has ? "已保存，留空则删除，改动请直接粘贴新值" : s.placeholder}
              className="h-8 w-full appearance-none rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-8 items-center rounded-lg bg-brand px-3 text-sm font-medium text-brand-foreground disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          保存凭据
        </button>
        {state.message ? (
          <span className="text-xs text-muted-foreground">{state.message}</span>
        ) : (
          <span className="text-xs text-muted-foreground">
            只存在你自己的账号下，worker 领任务时按需下发，不会写进日志
          </span>
        )}
      </div>
    </form>
  );
}
