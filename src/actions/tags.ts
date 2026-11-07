"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

/** 改名；若目标名已存在则合并（把关联迁过去再删旧标签） */
export async function renameTag(tagId: number, formData: FormData) {
  await requireSession("/tags");
  const name = String(formData.get("name") ?? "").trim().slice(0, 12);
  if (!name) return;

  const tag = await prisma.tag.findUnique({ where: { id: tagId }, select: { id: true, name: true } });
  if (!tag || tag.name === name) return;

  const existing = await prisma.tag.findUnique({ where: { name }, select: { id: true } });

  if (existing) {
    // 合并：把 entryTag 指向新标签，重复的忽略
    const links = await prisma.entryTag.findMany({ where: { tagId }, select: { entryId: true } });
    for (const l of links) {
      await prisma.entryTag
        .create({ data: { entryId: l.entryId, tagId: existing.id } })
        .catch(() => undefined);
    }
    await prisma.entryTag.deleteMany({ where: { tagId } });
    await prisma.tagConfig.deleteMany({ where: { name: tag.name } }).catch(() => undefined);
    await prisma.tag.delete({ where: { id: tagId } });
  } else {
    await prisma.tag.update({ where: { id: tagId }, data: { name } });
  }

  revalidatePath("/tags");
}

export async function deleteTag(tagId: number) {
  await requireSession("/tags");
  await prisma.entryTag.deleteMany({ where: { tagId } });
  await prisma.tag.delete({ where: { id: tagId } }).catch(() => undefined);
  revalidatePath("/tags");
}
