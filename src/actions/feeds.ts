"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { checkFeed } from "@/lib/feeds";

export async function subscribeFeed(url: string, title?: string) {
  const session = await requireSession("/");
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "订阅地址要以 http(s):// 开头" };

  await prisma.feed.upsert({
    where: { userId_url: { userId: session.userId, url } },
    update: { enabled: true, ...(title ? { title } : {}) },
    create: { userId: session.userId, url, title: title ?? null },
  });
  revalidatePath("/");
  return { ok: true };
}

export async function unsubscribeFeed(id: number) {
  const session = await requireSession("/");
  await prisma.feed.deleteMany({ where: { id, userId: session.userId } });
  revalidatePath("/");
}

export async function refreshFeed(id: number): Promise<void> {
  const session = await requireSession("/");
  const feed = await prisma.feed.findFirst({ where: { id, userId: session.userId }, select: { id: true } });
  if (!feed) return;
  try {
    await checkFeed(id);
  } catch (error) {
    console.error("刷新订阅失败", (error as Error).message);
  }
  revalidatePath("/");
}
