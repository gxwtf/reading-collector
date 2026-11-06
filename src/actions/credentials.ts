"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export type CredentialState = { ok: boolean; message?: string };

const FIELDS = ["zhihu", "bilibili", "weibo", "xiaohongshu"] as const;

/**
 * 保存各站登录态。留空的字段表示「删除该站凭据」；
 * 传 "keep" 表示保持原值不变（页面上只显示占位）。
 */
export async function saveCredentials(
  _prev: CredentialState,
  formData: FormData,
): Promise<CredentialState> {
  const session = await requireSession("/settings");

  const user = await prisma.user.findUnique({
    where: { userId: session.userId },
    select: { credentials: true },
  });
  const current = (user?.credentials ?? {}) as Record<string, string>;
  const next: Record<string, string> = {};

  for (const key of FIELDS) {
    const raw = (formData.get(key) ?? "").toString().trim();
    if (raw === "keep") {
      if (current[key]) next[key] = current[key];
    } else if (raw) {
      next[key] = raw.slice(0, 4000);
    }
    // 空字符串 = 清除
  }

  await prisma.user.update({
    where: { userId: session.userId },
    data: { credentials: next as never },
  });

  revalidatePath("/settings");
  return { ok: true, message: "已保存" };
}
