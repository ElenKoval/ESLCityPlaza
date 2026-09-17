import type { ClassRoster, Profile } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ClassSeed = {
  id: string;
  title: string;
  starts_at: string;
  location?: string | null;
  capacity: number;
};

function mapPeople(
  userIds: string[],
  people: Array<Pick<Profile, "id" | "display_name" | "role">>,
  orderIds?: string[],
) {
  const nameById = new Map(
    people.map((person) => [
      person.id,
      { displayName: person.display_name, role: person.role },
    ]),
  );
  const ids = orderIds ?? userIds;
  return ids.map((userId) => ({
    userId,
    displayName: nameById.get(userId)?.displayName ?? "Member",
    role: nameById.get(userId)?.role ?? ("student" as const),
  }));
}

export function mapClassRosters(
  classRows: ClassSeed[],
  enrolled: Array<{ class_id: string; user_id: string }>,
  people: Array<Pick<Profile, "id" | "display_name" | "role">>,
  waitlisted: Array<{ class_id: string; user_id: string; created_at: string }> = [],
): ClassRoster[] {
  return classRows.map((item) => {
    const enrolledIds = enrolled
      .filter((row) => row.class_id === item.id)
      .map((row) => row.user_id);
    const waitIds = waitlisted
      .filter((row) => row.class_id === item.id)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      .map((row) => row.user_id);

    const enrolledPeople = mapPeople(enrolledIds, people).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
    const waitPeople = mapPeople(waitIds, people, waitIds);

    return {
      classId: item.id,
      title: item.title,
      startsAt: item.starts_at,
      location: item.location ?? undefined,
      capacity: item.capacity,
      people: enrolledPeople,
      waitlist: waitPeople,
    };
  });
}

export async function loadClassRostersFor(
  supabase: SupabaseClient,
  classRows: ClassSeed[],
): Promise<ClassRoster[]> {
  if (classRows.length === 0) return [];

  const classIds = classRows.map((item) => item.id);
  const [{ data: enrolled }, waitResult] = await Promise.all([
    supabase.from("enrollments").select("class_id, user_id").in("class_id", classIds),
    supabase
      .from("class_waitlist")
      .select("class_id, user_id, created_at")
      .in("class_id", classIds),
  ]);

  if (waitResult.error) {
    console.error("[rosters] waitlist", waitResult.error.message);
  }

  const rows = enrolled ?? [];
  const waitRows =
    (waitResult.data as Array<{
      class_id: string;
      user_id: string;
      created_at: string;
    }> | null) ?? [];
  const userIds = [
    ...new Set([
      ...rows.map((row) => row.user_id),
      ...waitRows.map((row) => row.user_id),
    ]),
  ];
  let people: Array<Pick<Profile, "id" | "display_name" | "role">> = [];
  if (userIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, role")
      .in("id", userIds);
    people = (data ?? []) as Array<Pick<Profile, "id" | "display_name" | "role">>;
  }
  return mapClassRosters(classRows, rows, people, waitRows);
}
