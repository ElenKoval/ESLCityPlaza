import { createClient } from "@/lib/supabase/server";
import { hasDemoSession, useLocalDemo } from "@/lib/demo";
import { getDemoClassesWithEnrollments } from "@/lib/demo-classes";
import { getDemoClassTopics } from "@/lib/demo-class-topics";
import { CLASS_DURATION_MS, isPlazaCalendarClass } from "@/lib/enrollment";
import { canManageClassTopics } from "@/lib/roles";
import type { ClassRow, ClassTopicRow, ClassTopicSummary, Role } from "@/lib/types";

function attachClass(
  topic: ClassTopicRow,
  classes: Map<string, ClassRow>,
): ClassTopicRow {
  const cls = classes.get(topic.class_id);
  return {
    ...topic,
    class_title: cls?.title,
    class_starts_at: cls?.starts_at,
    class_location: cls?.location,
  };
}

async function loadClassesByIds(ids: string[]): Promise<Map<string, ClassRow>> {
  const map = new Map<string, ClassRow>();
  if (ids.length === 0) return map;

  if (useLocalDemo() || (await hasDemoSession())) {
    const rows = await getDemoClassesWithEnrollments();
    for (const row of rows) {
      if (ids.includes(row.id)) map.set(row.id, row);
    }
    return map;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("classes").select("*").in("id", ids);
  for (const row of (data ?? []) as ClassRow[]) map.set(row.id, row);
  return map;
}

export async function loadUpcomingClassesForTopics(): Promise<ClassRow[]> {
  const cutoff = new Date(Date.now() - CLASS_DURATION_MS).toISOString();
  const onlyCalendar = (rows: ClassRow[]) =>
    rows
      .filter(
        (row) => row.starts_at >= cutoff && isPlazaCalendarClass(row.starts_at),
      )
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      );

  if (useLocalDemo() || (await hasDemoSession())) {
    return onlyCalendar(await getDemoClassesWithEnrollments());
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select("*")
    .gte("starts_at", cutoff)
    .order("starts_at", { ascending: true });
  return onlyCalendar((data ?? []) as ClassRow[]);
}

export async function loadClassTopics(options?: {
  includeDrafts?: boolean;
}): Promise<ClassTopicRow[]> {
  const includeDrafts = Boolean(options?.includeDrafts);
  let rows: ClassTopicRow[] = [];

  if (useLocalDemo() || (await hasDemoSession())) {
    rows = await getDemoClassTopics();
    if (!includeDrafts) rows = rows.filter((row) => row.is_published);
  } else {
    try {
      const supabase = await createClient();
      let query = supabase.from("class_topics").select("*");
      if (!includeDrafts) query = query.eq("is_published", true);
      const { data, error } = await query;
      if (error) {
        console.error("[class-topics] list", error.message);
        rows = [];
      } else {
        rows = (data ?? []) as ClassTopicRow[];
      }
    } catch (error) {
      console.error("[class-topics] list", error);
      rows = [];
    }
  }

  const classes = await loadClassesByIds(rows.map((row) => row.class_id));
  return rows.map((row) => attachClass(row, classes));
}

export async function loadClassTopic(
  id: string,
  viewerRole?: Role | null,
): Promise<ClassTopicRow | null> {
  let row: ClassTopicRow | null = null;

  if (useLocalDemo() || (await hasDemoSession())) {
    const found = (await getDemoClassTopics()).find((item) => item.id === id);
    row = found ?? null;
  } else {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("class_topics")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        console.error("[class-topics] one", error.message);
        row = null;
      } else {
        row = (data as ClassTopicRow | null) ?? null;
      }
    } catch (error) {
      console.error("[class-topics] one", error);
      row = null;
    }
  }

  if (!row) return null;
  if (!row.is_published && !canManageClassTopics(viewerRole || "student")) {
    return null;
  }

  const classes = await loadClassesByIds([row.class_id]);
  return attachClass(row, classes);
}

export async function loadTopicSummariesByClassIds(
  classIds: string[],
): Promise<Map<string, ClassTopicSummary>> {
  const map = new Map<string, ClassTopicSummary>();
  if (classIds.length === 0) return map;

  let rows: ClassTopicSummary[] = [];
  if (useLocalDemo() || (await hasDemoSession())) {
    rows = (await getDemoClassTopics())
      .filter((row) => row.is_published && classIds.includes(row.class_id))
      .map((row) => ({
        id: row.id,
        class_id: row.class_id,
        title: row.title,
      }));
  } else {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("class_topics")
        .select("id, class_id, title")
        .eq("is_published", true)
        .in("class_id", classIds);
      if (error) {
        console.error("[class-topics] summaries", error.message);
      } else {
        rows = (data ?? []) as ClassTopicSummary[];
      }
    } catch (error) {
      console.error("[class-topics] summaries", error);
    }
  }

  for (const row of rows) map.set(row.class_id, row);
  return map;
}

export async function loadTopicIdsByClassIds(
  classIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (classIds.length === 0) return map;

  if (useLocalDemo() || (await hasDemoSession())) {
    for (const row of await getDemoClassTopics()) {
      if (classIds.includes(row.class_id)) map.set(row.class_id, row.id);
    }
    return map;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("class_topics")
      .select("id, class_id")
      .in("class_id", classIds);
    if (error) {
      console.error("[class-topics] ids", error.message);
      return map;
    }
    for (const row of data ?? []) map.set(row.class_id, row.id);
  } catch (error) {
    console.error("[class-topics] ids", error);
  }
  return map;
}
