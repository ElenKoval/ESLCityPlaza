import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import {
  getDemoSessionProfile,
  isDemoModeEnabled,
  useLocalDemo,
} from "./demo";
import type { Profile } from "./types";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
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
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    return { profile: (data as Profile | null) ?? null, userId: user.id };
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
  if (!profile || profile.status === "pending" || profile.status === "rejected") {
    redirect("/pending");
  }
  return { profile, userId };
}

export async function requireTech() {
  const { profile, userId } = await requireApproved();
  if (profile.role !== "tech") redirect("/");
  return { profile, userId };
}

export async function requireStaff() {
  const { profile, userId } = await requireApproved();
  if (profile.role !== "teacher" && profile.role !== "tech") {
    redirect("/");
  }
  return { profile, userId };
}
