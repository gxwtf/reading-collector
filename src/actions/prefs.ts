"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireSession } from "@/lib/session";

export type PrefsState = { ok: boolean; message?: string };

export async function savePrefs(
  _prev: PrefsState,
  formData: FormData,
): Promise<PrefsState> {
  const session = await requireSession("/settings");
  const preciseVideo = formData.get("preciseVideo") === "on";

  await prisma.user.update({
    where: { userId: session.userId },
    data: { prefs: { preciseVideo } as Prisma.InputJsonValue },
  });

  revalidatePath("/settings");
  return { ok: true, message: preciseVideo ? "已开启精确播放" : "已关闭精确播放" };
}
