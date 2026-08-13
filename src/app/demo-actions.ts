"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  DEMO_MEMBERS_COOKIE,
  DEMO_TECH_ID,
  demoKeyMatches,
  setDemoSession,
  clearDemoSession,
} from "@/lib/demo";
import { DEMO_ENROLLMENTS_COOKIE } from "@/lib/demo-classes";

export type DemoState = { error?: string } | null;

export async function enterDemo(
  _prev: DemoState,
  formData: FormData,
): Promise<DemoState> {
  const key = String(formData.get("key") || "").trim();
  if (!demoKeyMatches(key)) {
    return { error: "Wrong key" };
  }

  await setDemoSession(DEMO_TECH_ID);
  redirect("/tech");
}

export async function exitDemo() {
  await clearDemoSession();
  // Keep members cookie so applications survive logout.
  // Clear enrollments for this browser session on logout.
  const jar = await cookies();
  jar.set(DEMO_ENROLLMENTS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  // Avoid leaving a stale empty members wipe — do not clear DEMO_MEMBERS_COOKIE
  void DEMO_MEMBERS_COOKIE;
  redirect("/");
}
