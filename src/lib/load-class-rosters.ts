import { CLASS_DURATION_MS } from "@/lib/enrollment";
import type { ClassRoster, Profile } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ClassSeed = {
  id: string;
  title: string;
  starts_at: string;
  location?: string | null;
  capacity: number;
};

export function mapClassRosters(
  classRows: ClassSeed[],
  enrolled: Array<{ class_id: string; user_id: string }>,
  people: Array<Pick<Profile, "id" | "display_name" | "role">>,
): ClassRoster[] {
  const nameById = new Map(
    people.map((person) => [
      person.id,
      { displayName: person.display_name, role: person.role },
    ]),
  );

  return classRows.map((item) => ({
    classId: item.id,
    title: item.title,
    startsAt: item.starts_at,
    location: item.location ?? undefined,
    capacity: item.capacity,
    people: enrolled
      .filter((row) => row.class_id === item.id)
      .map((row) => ({
        userId: row.user_id,
        displayName: nameById.get(row.user_id)?.displayName ?? "Member",
        role: nameById.get(row.user_id)?.role ?? "student",
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  }));
}

export async function loadClassRostersFor(
  supabase: SupabaseClient,
  classRows: ClassSeed[],
): Promise<ClassRoster[]> {
  if (classRows.length === 0) return [];

  const classIds = classRows.map((item) => item.id);
  const { data: enrolled } = await supabase
    .from("enrollments")
    .select("class_id, user_id")
    .in("class_id", classIds);
  const rows = enrolled ?? [];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  let people: Array<Pick<Profile, "id" | "display_name" | "role">> = [];
  if (userIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, role")
      .in("id", userIds);
    people = (data ?? []) as Array<Pick<Profile, "id" | "display_name" | "role">>;
  }
  return mapClassRosters(classRows, rows, people);
}

export async function loadUpcomingClassRosters(
  supabase: SupabaseClient,
): Promise<ClassRoster[]> {
  const { data: classes } = await supabase
    .from("classes")
    .select("id, title, starts_at, location, capacity")
    .gte("starts_at", new Date(Date.now() - CLASS_DURATION_MS).toISOString())
    .order("starts_at", { ascending: true })
    .limit(16);
  return loadClassRostersFor(supabase, classes ?? []);
}
