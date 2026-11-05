"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/iron";

export async function logout() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  session.destroy();
  revalidatePath("/");
  redirect("/");
}
