"use client";

import { useActionState } from "react";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { saveCredentials, type CredentialState } from "@/actions/credentials";

const SITES = [
  {
    key: "zhihu",
    label: "知乎",
    hint: "整条 Cookie（含 z_c0）",
    placeholder: "z_c0=...; d_c0=...",
    login: "https://www.zhihu.com/signin",
    need: "整条 Cookie",
    how: "登录后按 F12 → Network → 刷新 → 点任意请求 → Request Headers 里的 Cookie 整行复制",
  },
  {
    key: "bilibili",
    label: "B 站",
    hint: "SESSDATA 的值（用于官方字幕）",
    placeholder: "SESSDATA 的值",
    login: "https://passport.bilibili.com/login",
    need: "SESSDATA",
    how: "登录后 F12 → Application → Cookies → bilibili.com → 复制 SESSDATA 那一行的 Value",
  },
  {
    key: "weibo",
    label: "微博",
    hint: "整条 Cookie（含 SUB）",
    placeholder: "SUB=...",
    login: "https://weibo.com/login.php",
    need: "整条 Cookie",
    how: "登录后 F12 → Network → 刷新 → 任意请求的 Cookie 整行复制（关键是 SUB）",
  },
  {
    key: "xiaohongshu",
    label: "小红书",
    hint: "整条 Cookie（含 web_session）",
    placeholder: "web_session=...",
    login: "https://www.xiaohongshu.com/explore",
    need: "整条 Cookie",
    how: "登录后 F12 → Application → Cookies → 复制 web_session 与 a1，或整行 Cookie",
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

      <details className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
          怎么获取 Cookie？（含各站直达入口）
        </summary>
        <ol className="mt-2 space-y-1.5 pl-4 text-xs leading-5 text-muted-foreground" style={{ listStyle: "decimal" }}>
          <li>在电脑浏览器登录对应站点（iPad 上没有开发者工具，建议电脑复制后用「通用剪贴板」粘贴过来）</li>
          <li>按 F12 打开开发者工具（Safari 需先在「设置 → 高级」里开启开发菜单）</li>
          <li>按下面的位置复制，整段粘贴到上方输入框，点「保存凭据」</li>
        </ol>

        <div className="mt-2 space-y-1">
          {SITES.map((s) => (
            <div key={s.key} className="flex flex-wrap items-baseline gap-1.5 text-xs">
              <a
                href={s.login}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-brand hover:underline"
              >
                {s.label}
                <ExternalLink className="size-3" />
              </a>
              <span className="text-muted-foreground">复制 <b className="font-medium text-foreground">{s.need}</b>：{s.how}</span>
            </div>
          ))}
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          提示：Cookie 等同于登录态，别发给别人；一般几周到几个月过期，抓取开始报 403 时重新复制一次即可。
        </p>
      </details>

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
