"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, demoKeyMatches } from "@/lib/demo";

export type DemoState = { error?: string } | null;

export async function enterDemo(
  _prev: DemoState,
  formData: FormData,
): Promise<DemoState> {
  const key = String(formData.get("key") || "").trim();
  if (!demoKeyMatches(key)) {
    return { error: "Wrong key" };
  }

  const jar = await cookies();
  jar.set(DEMO_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/chat");
}

export async function exitDemo() {
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
  redirect("/");
}
