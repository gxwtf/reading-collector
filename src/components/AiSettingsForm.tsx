"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlugZap, Save } from "lucide-react";
import { saveAiSettings, testAiSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";

type Props = {
  initialMode: "system" | "custom";
  initialApiBase: string;
  initialModel: string;
  hasKey: boolean;
  systemModel: string | null;
};

export function AiSettingsForm({ initialMode, initialApiBase, initialModel, hasKey, systemModel }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"system" | "custom">(initialMode);
  const [apiBase, setApiBase] = useState(initialApiBase);
  const [model, setModel] = useState(initialModel);
  const [apiKey, setApiKey] = useState("");
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function payload() {
    const fd = new FormData();
    fd.set("mode", mode);
    fd.set("apiBase", apiBase);
    fd.set("model", model);
    fd.set("apiKey", apiKey);
    return fd;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3">
          <input
            type="radio"
            name="mode"
            checked={mode === "system"}
            onChange={() => setMode("system")}
            className="mt-1 accent-[var(--primary)]"
          />
          <span>
            <span className="text-sm font-medium">站点默认模型</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {systemModel ? `当前：${systemModel}` : "站点未配置默认模型"}
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3">
          <input
            type="radio"
            name="mode"
            checked={mode === "custom"}
            onChange={() => setMode("custom")}
            className="mt-1 accent-[var(--primary)]"
          />
          <span>
            <span className="text-sm font-medium">我的自定义接口</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              任何 OpenAI 兼容接口（DeepSeek、OpenRouter、本地 vLLM…）
            </span>
          </span>
        </label>
      </div>

      <div className={mode === "custom" ? "space-y-2" : "space-y-2 opacity-50"}>
        <label className="block text-xs text-muted-foreground">接口地址</label>
        <input
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
          disabled={mode !== "custom"}
          placeholder="https://api.deepseek.com/v1"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed"
        />

        <label className="block text-xs text-muted-foreground">模型名</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={mode !== "custom"}
          placeholder="deepseek-chat"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed"
        />

        <label className="block text-xs text-muted-foreground">API Key</label>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={mode !== "custom"}
          type="password"
          placeholder={hasKey ? "已保存（留空则不修改）" : "sk-…"}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed"
        />
        <p className="text-[11px] text-muted-foreground">
          Key 只存在本站数据库里，不会出现在页面或日志中。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={saving}
          onClick={() =>
            startSave(async () => {
              const res = await saveAiSettings({ ok: false }, payload());
              setMessage({ ok: res.ok, text: res.message ?? "" });
              if (res.ok) {
                setApiKey("");
                router.refresh();
              }
            })
          }
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          保存
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={testing}
          onClick={() =>
            startTest(async () => {
              const res = await testAiSettings({ ok: false }, payload());
              setMessage({ ok: res.ok, text: res.message ?? "" });
            })
          }
        >
          {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
          测试连接
        </Button>

        {message ? (
          <span className={message.ok ? "text-sm text-green-700 dark:text-green-400" : "text-sm text-destructive"}>
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
