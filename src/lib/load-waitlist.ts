import type { ClassRow } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type WaitlistRow = {
  class_id: string;
  user_id: string;
  created_at: string;
};

export function attachWaitlistToClasses(
  classes: ClassRow[],
  rows: WaitlistRow[],
  userId: string | null,
): ClassRow[] {
  const byClass = new Map<string, WaitlistRow[]>();
  for (const row of rows) {
    const list = byClass.get(row.class_id) ?? [];
    list.push(row);
    byClass.set(row.class_id, list);
  }

  return classes.map((c) => {
    const list = (byClass.get(c.id) ?? []).sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const mine = userId
      ? list.findIndex((row) => row.user_id === userId)
      : -1;
    return {
      ...c,
      waitlist_count: list.length,
      waitlisted: mine >= 0,
      waitlist_position: mine >= 0 ? mine + 1 : null,
    };
  });
}

export async function loadWaitlistRows(
  supabase: SupabaseClient,
  classIds: string[],
): Promise<WaitlistRow[]> {
  if (classIds.length === 0) return [];
  const { data, error } = await supabase
    .from("class_waitlist")
    .select("class_id, user_id, created_at")
    .in("class_id", classIds);
  if (error) {
    // Table may not exist yet before SQL upgrade is run.
    console.error("[waitlist]", error.message);
    return [];
  }
  return (data ?? []) as WaitlistRow[];
}

export async function promoteNextFromWaitlist(
  supabase: SupabaseClient,
  classId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("promote_next_waitlist", {
    p_class_id: classId,
  });
  if (error) {
    console.error("[waitlist] promote", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}
