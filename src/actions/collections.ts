"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export type CollectionState = { ok: boolean; error?: string };

/** 新建分组（同一用户下名称唯一） */
export async function createCollection(
  _prev: CollectionState,
  formData: FormData,
): Promise<CollectionState> {
  const session = await requireSession("/");
  const name = String(formData.get("name") || "").trim().slice(0, 40);

  if (!name) return { ok: false, error: "分组名不能为空" };

  const exists = await prisma.collection.findFirst({
    where: { userId: session.userId, name },
    select: { id: true },
  });
  if (exists) return { ok: false, error: "已经有同名分组" };

  await prisma.collection.create({ data: { userId: session.userId, name } });
  revalidatePath("/");
  return { ok: true };
}

export async function renameCollection(collectionId: number, formData: FormData) {
  const session = await requireSession("/");
  const name = String(formData.get("name") || "").trim().slice(0, 40);
  if (!name) return;

  const owned = await prisma.collection.findFirst({
    where: { id: collectionId, userId: session.userId },
    select: { id: true },
  });
  if (!owned) return;

  await prisma.collection.update({ where: { id: collectionId }, data: { name } });
  revalidatePath("/");
}

export async function deleteCollection(collectionId: number) {
  const session = await requireSession("/");
  const owned = await prisma.collection.findFirst({
    where: { id: collectionId, userId: session.userId },
    select: { id: true },
  });
  if (!owned) return;

  // 只删分组与关联，条目本身留在库里
  await prisma.collection.delete({ where: { id: collectionId } });
  revalidatePath("/");
}

export async function addEntryToCollection(entryId: number, collectionId: number) {
  const session = await requireSession("/");

  const [entry, collection] = await Promise.all([
    prisma.entry.findFirst({ where: { id: entryId, userId: session.userId }, select: { id: true } }),
    prisma.collection.findFirst({
      where: { id: collectionId, userId: session.userId },
      select: { id: true },
    }),
  ]);
  if (!entry || !collection) return;

  await prisma.collectionEntry.upsert({
    where: { collectionId_entryId: { collectionId, entryId } },
    update: {},
    create: { collectionId, entryId },
  });
  revalidatePath(`/entry/${entryId}`);
  revalidatePath("/");
}

export async function removeEntryFromCollection(entryId: number, collectionId: number) {
  const session = await requireSession("/");

  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId: session.userId },
    select: { id: true },
  });
  if (!entry) return;

  await prisma.collectionEntry.deleteMany({ where: { entryId, collectionId } });
  revalidatePath(`/entry/${entryId}`);
  revalidatePath("/");
}
