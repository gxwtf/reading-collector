// 统一模型调用：用户自带（BYOK）优先，其次是站点默认（LLM_CONFIGS / OPENAI_*）
import { prisma } from "@/lib/db";

export type LlmConfig = { apiBase: string; apiKey: string; model: string };

type StoredSettings = {
  mode?: "system" | "custom";
  apiBase?: string;
  apiKey?: string;
  model?: string;
};

/**
 * 站点默认模型列表：LLM_CONFIGS 里的每一项都是一把独立的 key，
 * 前面的失败会自动换下一把（多 key 轮换 / 兜底）。
 */
export function systemConfigs(): LlmConfig[] {
  const out: LlmConfig[] = [];
  const raw = process.env.LLM_CONFIGS;

  if (raw) {
    try {
      const arr = JSON.parse(raw) as Array<Partial<LlmConfig>>;
      for (const c of arr) {
        if (c.apiBase && c.apiKey && c.model) {
          out.push({ apiBase: c.apiBase, apiKey: c.apiKey, model: c.model });
        }
      }
    } catch (error) {
      console.error("解析 LLM_CONFIGS 失败", error);
    }
  }

  if (out.length === 0 && process.env.OPENAI_API_KEY) {
    out.push({
      apiBase: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    });
  }

  return out;
}

/** 展示用：第一把 key 的配置 */
export function systemConfig(): LlmConfig | null {
  return systemConfigs()[0] ?? null;
}

/** 当前用户可用的配置：自带优先（单条），否则站点的全部 key */
export async function configsForUser(
  userId: number,
): Promise<{ cfgs: LlmConfig[]; source: "custom" | "system" | "none" }> {
  const user = await prisma.user.findUnique({
    where: { userId },
    select: { aiSettings: true },
  });
  const stored = (user?.aiSettings ?? null) as StoredSettings | null;

  if (stored?.apiBase && stored.apiKey && stored.model) {
    return {
      cfgs: [{ apiBase: stored.apiBase, apiKey: stored.apiKey, model: stored.model }],
      source: "custom",
    };
  }

  const cfgs = systemConfigs();
  return { cfgs, source: cfgs.length > 0 ? "system" : "none" };
}

/** 兼容旧调用：只取第一条 */
export async function configForUser(
  userId: number,
): Promise<{ cfg: LlmConfig | null; source: "custom" | "system" | "none" }> {
  const { cfgs, source } = await configsForUser(userId);
  return { cfg: cfgs[0] ?? null, source };
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

const SUMMARY_PROMPT = `你在为「阅读收集」写一份读书笔记摘要。请严格按下面的 Markdown 结构输出，不要任何开场白或额外解释：

## 一句话结论
（一句话，不超过 40 字，说清这篇最重要的判断或发现）

## 分章要点
- **小标题**：要点（每条不超过 60 字，4-8 条）
- 视频/播客按时间顺序，每条以 \`[mm:ss]\` 开头，例如 \`[03:20] **为什么 agent 需要常驻**：…\`
- 文章按原文的论证顺序，讲机制、讲取舍，不要复述流水账

## 金句
> 原文原句（视频/播客标 \`[mm:ss]\`）
（1-3 条，只挑真正有信息量或画面感的句子，不要编造）

要求：具体、带数字与专有名词；人名与术语保留原文；中文输出。`;

export async function aiSummary(
  text: string,
  cfg: LlmConfig,
  options: { kind?: "article" | "video" | "podcast" } = {},
): Promise<string> {
  const content = text.slice(0, 12_000);
  const reply = await chat(
    cfg,
    [
      { role: "system", content: SUMMARY_PROMPT },
      {
        role: "user",
        content: `${options.kind === "article" ? "这是一篇文章" : "这是音视频的逐字稿，时间戳已在每段开头"}：\n\n${content}`,
      },
    ],
    // 推理型模型会先消耗思考 token，预算给足，否则 content 为空
    { maxTokens: 2500, temperature: 0.2, timeoutMs: 90_000 },
  );

  const cleaned = reply.trim();
  if (!cleaned.includes("一句话结论") && cleaned.length < 30) {
    throw new Error("模型返回的摘要格式不对");
  }
  return cleaned;
}
