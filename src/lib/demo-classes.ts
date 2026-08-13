import { cookies } from "next/headers";
import { getDemoProfile } from "@/lib/demo";
import type { ClassRow } from "@/lib/types";

export const DEMO_ENROLLMENTS_COOKIE = "esl_demo_enrollments";

export function buildDemoClasses(): ClassRow[] {
  const now = new Date();
  return [
    {
      id: "demo-mon",
      title: "Conversation Circle",
      description: "Casual English practice at the plaza",
      starts_at: nextWeekday(now, 1, 18, 0).toISOString(),
      capacity: 15,
      created_by: getDemoProfile().id,
      created_at: now.toISOString(),
      enrollment_count: 3,
      enrolled: false,
    },
    {
      id: "demo-fri",
      title: "Friday Session",
      description: "1:00 PM – 3:00 PM practice with the group",
      starts_at: nextWeekday(now, 5, 13, 0).toISOString(),
      capacity: 15,
      created_by: getDemoProfile().id,
      created_at: now.toISOString(),
      enrollment_count: 2,
      enrolled: false,
    },
  ];
}

function nextWeekday(from: Date, weekday: number, hour = 18, minute = 0) {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  const delta = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  if (d.getTime() < from.getTime() - 60 * 60 * 1000) {
    d.setDate(d.getDate() + 7);
  }
  return d;
}

export async function getDemoEnrollmentIds(): Promise<string[]> {
  const jar = await cookies();
  const raw = jar.get(DEMO_ENROLLMENTS_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveDemoEnrollmentIds(ids: string[]) {
  const jar = await cookies();
  jar.set(
    DEMO_ENROLLMENTS_COOKIE,
    encodeURIComponent(JSON.stringify([...new Set(ids)])),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  );
}

export async function getDemoClassesWithEnrollments(): Promise<ClassRow[]> {
  const enrolled = new Set(await getDemoEnrollmentIds());
  return buildDemoClasses().map((c) => ({
    ...c,
    enrolled: enrolled.has(c.id),
    enrollment_count: (c.enrollment_count ?? 0) + (enrolled.has(c.id) ? 1 : 0),
  }));
}
