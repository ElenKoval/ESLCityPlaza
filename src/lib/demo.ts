import { cookies } from "next/headers";
import type { Profile, RequestedRole } from "./types";

export const DEMO_COOKIE = "esl_demo_session";
export const DEMO_MEMBERS_COOKIE = "esl_demo_members";

export const DEMO_TECH_ID = "00000000-0000-4000-8000-000000000001";

export type DemoMember = Profile & {
  email?: string;
  password?: string;
};

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
    id: DEMO_TECH_ID,
    display_name: "Elena (Tech)",
    role: "tech",
    status: "approved",
    requested_role: "student",
    hometown: "",
    languages: [],
    interests: [],
    bio: "",
    onboarding_completed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    reviewed_at: new Date().toISOString(),
    reviewed_by: null,
  };
}

function techSeed(): DemoMember {
  return {
    ...getDemoProfile(),
    email: "tech@esl.local",
    password: process.env.DEMO_ACCESS_KEY || "plaza-elena",
  };
}

export function seedDemoMembers(): DemoMember[] {
  const now = Date.now();
  return [
    techSeed(),
    {
      id: "demo-pending-1",
      display_name: "Alex Kim",
      role: "student",
      status: "pending",
      requested_role: "student",
      created_at: new Date(now - 3600_000).toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      email: "alex@example.com",
      password: "demo123",
    },
    {
      id: "demo-pending-2",
      display_name: "Sam Rivera",
      role: "teacher",
      status: "pending",
      requested_role: "teacher",
      created_at: new Date(now - 7200_000).toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      email: "sam@example.com",
      password: "demo123",
    },
    {
      id: "demo-member-1",
      display_name: "Jordan Lee",
      role: "student",
      status: "approved",
      requested_role: "student",
      created_at: new Date(now - 86400_000 * 3).toISOString(),
      reviewed_at: new Date(now - 86400_000 * 2).toISOString(),
      reviewed_by: DEMO_TECH_ID,
      onboarding_completed_at: null,
      email: "jordan@example.com",
      password: "demo123",
    },
  ];
}

export function toPublicProfile(member: DemoMember): Profile {
  return {
    id: member.id,
    display_name: member.display_name,
    role: member.role,
    status: member.status,
    requested_role: member.requested_role,
    hometown: member.hometown,
    languages: member.languages,
    interests: member.interests,
    bio: member.bio,
    onboarding_completed_at: member.onboarding_completed_at,
    created_at: member.created_at,
    reviewed_at: member.reviewed_at,
    reviewed_by: member.reviewed_by,
    email: member.email,
  };
}

/** Cookie value is the member id (legacy "1" = tech). */
export async function getDemoSessionUserId(): Promise<string | null> {
  if (!isDemoModeEnabled()) return null;
  const jar = await cookies();
  const raw = jar.get(DEMO_COOKIE)?.value;
  if (!raw) return null;
  if (raw === "1") return DEMO_TECH_ID;
  return raw;
}

export async function hasDemoSession() {
  return Boolean(await getDemoSessionUserId());
}

export async function setDemoSession(userId: string) {
  const jar = await cookies();
  jar.set(DEMO_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearDemoSession() {
  const jar = await cookies();
  jar.set(DEMO_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getDemoMembers(): Promise<DemoMember[]> {
  const jar = await cookies();
  const raw = jar.get(DEMO_MEMBERS_COOKIE)?.value;
  if (!raw) return seedDemoMembers();
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as DemoMember[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return seedDemoMembers();
    }
    // Ensure tech account always exists
    if (!parsed.some((m) => m.id === DEMO_TECH_ID)) {
      return [techSeed(), ...parsed];
    }
    return parsed;
  } catch {
    return seedDemoMembers();
  }
}

export async function saveDemoMembers(members: DemoMember[]) {
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

export async function getDemoSessionProfile(): Promise<Profile | null> {
  const userId = await getDemoSessionUserId();
  if (!userId) return null;
  const members = await getDemoMembers();
  const member = members.find((m) => m.id === userId);
  if (!member) {
    if (userId === DEMO_TECH_ID) return getDemoProfile();
    return null;
  }
  return toPublicProfile(member);
}

export function createPendingMember(input: {
  displayName: string;
  email: string;
  password: string;
  requestedRole: RequestedRole;
}): DemoMember {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    display_name: input.displayName,
    role: input.requestedRole,
    status: "pending",
    requested_role: input.requestedRole,
    hometown: "",
    languages: [],
    interests: [],
    bio: "",
    onboarding_completed_at: null,
    created_at: now,
    reviewed_at: null,
    reviewed_by: null,
    email: input.email.trim().toLowerCase(),
    password: input.password,
  };
}
