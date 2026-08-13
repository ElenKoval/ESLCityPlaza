import { cookies } from "next/headers";
import type { Profile } from "./types";

export const DEMO_COOKIE = "esl_demo_session";
export const DEMO_MEMBERS_COOKIE = "esl_demo_members";

export function isDemoModeEnabled() {
  return Boolean(process.env.DEMO_ACCESS_KEY);
}

export function demoKeyMatches(key: string) {
  const expected = process.env.DEMO_ACCESS_KEY;
  return Boolean(expected && key === expected);
}

/** True when Supabase is not configured — use local demo auth/data */
export function useLocalDemo() {
  return (
    isDemoModeEnabled() &&
    !(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  );
}

export function getDemoProfile(): Profile {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    display_name: "Elena (Tech)",
    role: "tech",
    status: "approved",
    requested_role: "student",
    created_at: new Date().toISOString(),
    reviewed_at: new Date().toISOString(),
    reviewed_by: null,
  };
}

export function seedDemoMembers(): Profile[] {
  const now = Date.now();
  return [
    getDemoProfile(),
    {
      id: "demo-pending-1",
      display_name: "Alex Kim",
      role: "student",
      status: "pending",
      requested_role: "student",
      created_at: new Date(now - 3600_000).toISOString(),
      reviewed_at: null,
      reviewed_by: null,
    },
    {
      id: "demo-pending-2",
      display_name: "Sam Rivera",
      role: "volunteer",
      status: "pending",
      requested_role: "volunteer",
      created_at: new Date(now - 7200_000).toISOString(),
      reviewed_at: null,
      reviewed_by: null,
    },
    {
      id: "demo-member-1",
      display_name: "Jordan Lee",
      role: "student",
      status: "approved",
      requested_role: "student",
      created_at: new Date(now - 86400_000 * 3).toISOString(),
      reviewed_at: new Date(now - 86400_000 * 2).toISOString(),
      reviewed_by: getDemoProfile().id,
    },
  ];
}

export async function hasDemoSession() {
  if (!isDemoModeEnabled()) return false;
  const jar = await cookies();
  return jar.get(DEMO_COOKIE)?.value === "1";
}

export async function getDemoMembers(): Promise<Profile[]> {
  const jar = await cookies();
  const raw = jar.get(DEMO_MEMBERS_COOKIE)?.value;
  if (!raw) return seedDemoMembers();
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Profile[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return seedDemoMembers();
    }
    return parsed;
  } catch {
    return seedDemoMembers();
  }
}

export async function saveDemoMembers(members: Profile[]) {
  const jar = await cookies();
  jar.set(DEMO_MEMBERS_COOKIE, encodeURIComponent(JSON.stringify(members)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function resetDemoMembers() {
  await saveDemoMembers(seedDemoMembers());
}
