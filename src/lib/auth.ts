import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import {
  getDemoSessionProfile,
  isDemoModeEnabled,
  useLocalDemo,
} from "./demo";
import {
  canManageClasses,
  canManageClassTopics,
  canReviewApplications,
} from "./roles";
import { withTimeout } from "./with-timeout";
import type { Profile } from "./types";

const AUTH_TIMEOUT_MS = 8_000;

function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export async function getSessionUser() {
  if (!hasSupabaseEnv()) {
    return { supabase: null, user: null };
  }
  const supabase = await createClient();
  try {
    const {
      data: { user },
    } = await withTimeout(
      supabase.auth.getUser(),
      AUTH_TIMEOUT_MS,
      "getUser",
    );
    return { supabase, user };
  } catch (error) {
    console.error(
      "[auth] getUser",
      error instanceof Error ? error.message : error,
    );
    return { supabase, user: null };
  }
}

export const getProfile = cache(async (): Promise<{
  profile: Profile | null;
  userId: string | null;
}> => {
  // Local demo only (no Supabase keys)
  if (useLocalDemo()) {
    const profile = await getDemoSessionProfile();
    return profile
      ? { profile, userId: profile.id }
      : { profile: null, userId: null };
  }

  const { supabase, user } = await getSessionUser();
  if (supabase && user) {
    try {
      const { data } = await withTimeout(
        Promise.resolve(
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        ),
        AUTH_TIMEOUT_MS,
        "getProfile",
      );
      return { profile: (data as Profile | null) ?? null, userId: user.id };
    } catch (error) {
      console.error(
        "[auth] getProfile",
        error instanceof Error ? error.message : error,
      );
      return { profile: null, userId: user.id };
    }
  }

  // Optional Tech key fallback when Supabase is configured but unused
  if (isDemoModeEnabled()) {
    const profile = await getDemoSessionProfile();
    if (profile) return { profile, userId: profile.id };
  }

  return { profile: null, userId: null };
});

export async function requireUser() {
  const { profile, userId } = await getProfile();
  if (!userId) redirect("/login");
  return { profile, userId };
}

export async function requireApproved() {
  const { profile, userId } = await requireUser();
  if (!profile || profile.status !== "approved") {
    if (profile?.status === "suspended") redirect("/suspended");
    redirect("/pending");
  }
  return { profile, userId };
}

export async function requireTech() {
  const { profile, userId } = await requireApproved();
  if (profile.role !== "tech") redirect("/");
  return { profile, userId };
}

/** Teacher or Tech only — not ADMIN. Use for Schedule / Class Topics. */
export async function requireStaff() {
  const { profile, userId } = await requireApproved();
  if (!canManageClasses(profile.role) && !canManageClassTopics(profile.role)) {
    redirect("/");
  }
  return { profile, userId };
}

/** Teacher, Admin, or Tech — member management at /members. */
export async function requireApprover() {
  const { profile, userId } = await requireApproved();
  if (!canReviewApplications(profile.role)) redirect("/");
  return { profile, userId };
}
