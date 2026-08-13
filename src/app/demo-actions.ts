"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  DEMO_COOKIE,
  DEMO_MEMBERS_COOKIE,
  demoKeyMatches,
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
  // Must match path used when setting, or the cookie stays
  jar.set(DEMO_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  jar.set(DEMO_MEMBERS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  jar.set(DEMO_ENROLLMENTS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  redirect("/");
}
