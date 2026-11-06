"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireSession } from "@/lib/session";
import { configForUser, systemConfig, chat } from "@/lib/llm";

export type AiSettingsState = { ok: boolean; message?: string };

type Stored = { mode?: "system" | "custom"; apiBase?: string; apiKey?: string; model?: string };

/** 保存用户的模型设置；apiKey 留空表示沿用旧值 */
export async function saveAiSettings(
  _prev: AiSettingsState,
  formData: FormData,
): Promise<AiSettingsState> {
  const session = await requireSession("/settings");

  const mode = formData.get("mode") === "custom" ? "custom" : "system";
  const apiBase = String(formData.get("apiBase") || "").trim();
  const model = String(formData.get("model") || "").trim();
  const apiKeyInput = String(formData.get("apiKey") || "").trim();

  const user = await prisma.user.findUnique({
    where: { userId: session.userId },
    select: { aiSettings: true },
  });
  const old = (user?.aiSettings ?? {}) as Stored;
  const apiKey = apiKeyInput || old.apiKey || "";

  if (mode === "custom") {
    if (!apiBase || !model || !apiKey) {
      return { ok: false, message: "自定义模式需要填写接口地址、模型名和 API Key" };
    }
    if (!/^https?:\/\//i.test(apiBase)) {
      return { ok: false, message: "接口地址要以 http(s):// 开头" };
    }
  }

  const next: Stored =
    mode === "custom"
      ? { mode, apiBase, model, apiKey }
      : { mode: "system", apiBase: old.apiBase, model: old.model, apiKey: old.apiKey };

  await prisma.user.update({
    where: { userId: session.userId },
    data: { aiSettings: next as Prisma.InputJsonValue },
  });

  revalidatePath("/settings");
  return {
    ok: true,
    message: mode === "custom" ? "已切换到自定义接口" : "已切换回站点默认模型",
  };
}

/** 用当前（或表单里填的）配置发一条最小请求，验证连通性 */
export async function testAiSettings(
  _prev: AiSettingsState,
  formData: FormData,
): Promise<AiSettingsState> {
  const session = await requireSession("/settings");

  const apiBase = String(formData.get("apiBase") || "").trim();
  const model = String(formData.get("model") || "").trim();
  const apiKeyInput = String(formData.get("apiKey") || "").trim();

  const user = await prisma.user.findUnique({
    where: { userId: session.userId },
    select: { aiSettings: true },
  });
  const stored = (user?.aiSettings ?? {}) as Stored;

  const cfg =
    apiBase && model
      ? { apiBase, model, apiKey: apiKeyInput || stored.apiKey || "" }
      : (await configForUser(session.userId)).cfg ?? systemConfig();

  if (!cfg || !cfg.apiKey) return { ok: false, message: "还没有可用的配置（缺 API Key）" };

  const started = Date.now();
  try {
    const reply = await chat(
      cfg,
      [
        { role: "system", content: "你是连通性测试助手。" },
        { role: "user", content: "只回复两个字：可用" },
      ],
      { maxTokens: 10, timeoutMs: 20_000 },
    );
    const ms = Date.now() - started;
    return { ok: true, message: `连接正常（${cfg.model}，${ms} ms）：${reply.slice(0, 20)}` };
  } catch (error) {
    return { ok: false, message: `连接失败：${(error as Error).message.slice(0, 160)}` };
  }
}
