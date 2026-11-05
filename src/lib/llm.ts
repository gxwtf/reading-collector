// 统一模型调用：用户自带（BYOK）优先，其次是站点默认（LLM_CONFIGS / OPENAI_*）
import { prisma } from "@/lib/db";

export type LlmConfig = { apiBase: string; apiKey: string; model: string };

type StoredSettings = {
  mode?: "system" | "custom";
  apiBase?: string;
  apiKey?: string;
  model?: string;
};

/** 站点默认模型：环境变量里的 LLM_CONFIGS（JSON 数组）或 OPENAI_* 三件套 */
export function systemConfig(): LlmConfig | null {
  const raw = process.env.LLM_CONFIGS;
  if (raw) {
    try {
      const arr = JSON.parse(raw) as Array<Partial<LlmConfig>>;
      const found = arr.find((c) => c.apiBase && c.apiKey && c.model);
      if (found) {
        return { apiBase: found.apiBase!, apiKey: found.apiKey!, model: found.model! };
      }
    } catch (error) {
      console.error("解析 LLM_CONFIGS 失败", error);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      apiBase: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }

  return null;
}

/** 当前用户实际使用的配置：自带优先，否则系统默认 */
export async function configForUser(
  userId: number,
): Promise<{ cfg: LlmConfig | null; source: "custom" | "system" | "none" }> {
  const user = await prisma.user.findUnique({
    where: { userId },
    select: { aiSettings: true },
  });
  const stored = (user?.aiSettings ?? null) as StoredSettings | null;

  if (stored?.apiBase && stored.apiKey && stored.model) {
    return {
      cfg: { apiBase: stored.apiBase, apiKey: stored.apiKey, model: stored.model },
      source: "custom",
    };
  }

  const cfg = systemConfig();
  return { cfg, source: cfg ? "system" : "none" };
}

/** OpenAI 兼容 chat 调用（非流式，适合一次性任务） */
export async function chat(
  cfg: LlmConfig,
  messages: { role: "system" | "user"; content: string }[],
  options: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const { maxTokens = 1200, temperature = 0.3, timeoutMs = 50_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${cfg.apiBase.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, messages, max_tokens: maxTokens, temperature }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`模型接口 ${res.status}：${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("模型没有返回内容");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

const SUMMARY_PROMPT = `你在帮用户做阅读摘要。请把下面的文章（或逐字稿）概括成 4-8 条中文要点。

要求：
- 每条一行，以「- 」开头，不超过 60 字
- 抓具体信息（人物、数字、结论、方法与反例），不要空话
- 保留原文的关键概念与专有名词，不要翻译人名
- 只输出要点列表，不要任何开场白或总结句`;

/** AI 概括；失败时抛错，由调用方回退到抽取式 */
export async function aiSummary(text: string, cfg: LlmConfig): Promise<string> {
  const content = text.slice(0, 12_000);
  const reply = await chat(
    cfg,
    [
      { role: "system", content: SUMMARY_PROMPT },
      { role: "user", content },
    ],
    // 推理型模型会先消耗思考 token，预算给足，否则 content 为空
    { maxTokens: 2500, temperature: 0.2, timeoutMs: 90_000 },
  );

  const lines = reply
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("-") || /^\d+[.、]/.test(l))
    .map((l) => `- ${l.replace(/^(-|\d+[.、])\s*/, "")}`);

  if (lines.length === 0) throw new Error("模型返回的摘要格式不对");
  return lines.slice(0, 10).join("\n");
}
