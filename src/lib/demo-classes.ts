import { cookies } from "next/headers";
import { buildDemoClasses } from "@/lib/demo-class-data";
import type { ClassRow } from "@/lib/types";

export const DEMO_ENROLLMENTS_COOKIE = "esl_demo_enrollments";

export { buildDemoClasses };

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
