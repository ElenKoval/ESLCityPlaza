import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { hasDemoSession, useLocalDemo } from "@/lib/demo";
import { getDemoClassesWithEnrollments } from "@/lib/demo-classes";
import { getDemoClassTopics } from "@/lib/demo-class-topics";
import { CLASS_DURATION_MS, isPlazaCalendarClass } from "@/lib/enrollment";
import { canManageClassTopics } from "@/lib/roles";
import {
  splitClassTopics,
  withPrimaryMeetingFields,
} from "@/lib/class-topics";
import type {
  ClassRow,
  ClassTopicMeeting,
  ClassTopicRow,
  ClassTopicSummary,
  Role,
} from "@/lib/types";

type TopicBase = {
  id: string;
  title: string;
  content: string;
  created_by: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

/** Prefer service role for public/home reads (same pattern as announcements). */
function topicsDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    return createServiceClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return null;
}

async function topicsClient() {
  return topicsDb() ?? (await createClient());
}

async function loadClassesByIds(ids: string[]): Promise<Map<string, ClassRow>> {
  const map = new Map<string, ClassRow>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;

  if (useLocalDemo() || (await hasDemoSession())) {
    const rows = await getDemoClassesWithEnrollments();
    for (const row of rows) {
      if (unique.includes(row.id)) map.set(row.id, row);
    }
    return map;
  }

  const supabase = await topicsClient();
  const { data } = await supabase.from("classes").select("*").in("id", unique);
  for (const row of (data ?? []) as ClassRow[]) map.set(row.id, row);
  return map;
}

function meetingsFromClasses(
  classIds: string[],
  classes: Map<string, ClassRow>,
): ClassTopicMeeting[] {
  const meetings: ClassTopicMeeting[] = [];
  for (const classId of classIds) {
    const cls = classes.get(classId);
    if (!cls) continue;
    meetings.push({
      class_id: cls.id,
      class_title: cls.title,
      class_starts_at: cls.starts_at,
      class_location: cls.location,
    });
  }
  return meetings;
}

function hydrateTopic(
  base: TopicBase,
  classIds: string[],
  classes: Map<string, ClassRow>,
): ClassTopicRow {
  return withPrimaryMeetingFields({
    ...base,
    meetings: meetingsFromClasses(classIds, classes),
  });
}

async function loadMeetingLinksByTopicIds(
  topicIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (topicIds.length === 0) return map;

  if (useLocalDemo() || (await hasDemoSession())) {
    for (const row of await getDemoClassTopics()) {
      if (!topicIds.includes(row.id)) continue;
      const ids =
        row.meetings?.map((m) => m.class_id) ||
        (row.class_id ? [row.class_id] : []);
      map.set(row.id, ids);
    }
    return map;
  }

  const supabase = await topicsClient();
  const { data, error } = await supabase
    .from("class_topic_meetings")
    .select("topic_id, class_id")
    .in("topic_id", topicIds);
  if (error) {
    console.error("[class-topics] meetings", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const list = map.get(row.topic_id) ?? [];
    list.push(row.class_id);
    map.set(row.topic_id, list);
  }
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

  const supabase = await topicsClient();
  const { data } = await supabase
    .from("classes")
    .select("*")
    .gte("starts_at", cutoff)
    .order("starts_at", { ascending: true });
  return onlyCalendar((data ?? []) as ClassRow[]);
}

/** Upcoming meetings plus any already-linked classes (so past links stay visible). */
export async function loadClassesForTopicForm(
  linkedClassIds: string[] = [],
): Promise<ClassRow[]> {
  const upcoming = await loadUpcomingClassesForTopics();
  const have = new Set(upcoming.map((row) => row.id));
  const missing = linkedClassIds.filter((id) => id && !have.has(id));
  if (!missing.length) return upcoming;

  const extras = await loadClassesByIds(missing);
  const extraRows = missing
    .map((id) => extras.get(id))
    .filter((row): row is ClassRow => Boolean(row));
  return [...extraRows, ...upcoming].sort(
    (a, b) =>
      new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
}

export async function loadClassTopics(options?: {
  includeDrafts?: boolean;
}): Promise<ClassTopicRow[]> {
  const includeDrafts = Boolean(options?.includeDrafts);
  let bases: TopicBase[] = [];

  if (useLocalDemo() || (await hasDemoSession())) {
    let rows = await getDemoClassTopics();
    if (!includeDrafts) rows = rows.filter((row) => row.is_published);
    return rows.map((row) =>
      withPrimaryMeetingFields({
        ...row,
        meetings:
          row.meetings?.length
            ? row.meetings
            : row.class_id && row.class_starts_at
              ? [
                  {
                    class_id: row.class_id,
                    class_title: row.class_title,
                    class_starts_at: row.class_starts_at,
                    class_location: row.class_location,
                  },
                ]
              : [],
      }),
    );
  }

  try {
    const supabase = await topicsClient();
    let query = supabase.from("class_topics").select("*");
    if (!includeDrafts) query = query.eq("is_published", true);
    const { data, error } = await query;
    if (error) {
      console.error("[class-topics] list", error.message);
      return [];
    }
    bases = (data ?? []) as TopicBase[];
  } catch (error) {
    console.error("[class-topics] list", error);
    return [];
  }

  const links = await loadMeetingLinksByTopicIds(bases.map((row) => row.id));
  const allClassIds = [...links.values()].flat();
  const classes = await loadClassesByIds(allClassIds);
  return bases.map((row) =>
    hydrateTopic(row, links.get(row.id) ?? [], classes),
  );
}

export async function loadClassTopic(
  id: string,
  viewerRole?: Role | null,
): Promise<ClassTopicRow | null> {
  let base: TopicBase | null = null;

  if (useLocalDemo() || (await hasDemoSession())) {
    const found = (await getDemoClassTopics()).find((item) => item.id === id);
    if (!found) return null;
    if (!found.is_published && !canManageClassTopics(viewerRole || "student")) {
      return null;
    }
    return withPrimaryMeetingFields({
      ...found,
      meetings:
        found.meetings?.length
          ? found.meetings
          : found.class_id && found.class_starts_at
            ? [
                {
                  class_id: found.class_id,
                  class_title: found.class_title,
                  class_starts_at: found.class_starts_at,
                  class_location: found.class_location,
                },
              ]
            : [],
    });
  }

  try {
    const supabase = await topicsClient();
    const { data, error } = await supabase
      .from("class_topics")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[class-topics] one", error.message);
      return null;
    }
    base = (data as TopicBase | null) ?? null;
  } catch (error) {
    console.error("[class-topics] one", error);
    return null;
  }

  if (!base) return null;
  if (!base.is_published && !canManageClassTopics(viewerRole || "student")) {
    return null;
  }

  const links = await loadMeetingLinksByTopicIds([base.id]);
  const classIds = links.get(base.id) ?? [];
  const classes = await loadClassesByIds(classIds);
  return hydrateTopic(base, classIds, classes);
}

export async function loadTopicSummariesByClassIds(
  classIds: string[],
): Promise<Map<string, ClassTopicSummary>> {
  const map = new Map<string, ClassTopicSummary>();
  if (classIds.length === 0) return map;

  if (useLocalDemo() || (await hasDemoSession())) {
    for (const row of await getDemoClassTopics()) {
      if (!row.is_published) continue;
      const ids =
        row.meetings?.map((m) => m.class_id) ||
        (row.class_id ? [row.class_id] : []);
      for (const classId of ids) {
        if (classIds.includes(classId) && !map.has(classId)) {
          map.set(classId, { id: row.id, class_id: classId, title: row.title });
        }
      }
    }
    return map;
  }

  try {
    const supabase = await topicsClient();
    const { data, error } = await supabase
      .from("class_topic_meetings")
      .select("topic_id, class_id, class_topics!inner(id, title, is_published)")
      .in("class_id", classIds);
    if (error) {
      console.error("[class-topics] summaries", error.message);
      return map;
    }
    for (const raw of data ?? []) {
      const row = raw as {
        topic_id: string;
        class_id: string;
        class_topics:
          | { id: string; title: string; is_published: boolean }
          | { id: string; title: string; is_published: boolean }[]
          | null;
      };
      const topic = Array.isArray(row.class_topics)
        ? row.class_topics[0]
        : row.class_topics;
      if (!topic?.is_published) continue;
      if (!map.has(row.class_id)) {
        map.set(row.class_id, {
          id: topic.id,
          class_id: row.class_id,
          title: topic.title,
        });
      }
    }
  } catch (error) {
    console.error("[class-topics] summaries", error);
  }
  return map;
}

export async function loadTopicIdsByClassIds(
  classIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (classIds.length === 0) return map;

  if (useLocalDemo() || (await hasDemoSession())) {
    for (const row of await getDemoClassTopics()) {
      const ids =
        row.meetings?.map((m) => m.class_id) ||
        (row.class_id ? [row.class_id] : []);
      for (const classId of ids) {
        if (!classIds.includes(classId)) continue;
        const list = map.get(classId) ?? [];
        list.push(row.id);
        map.set(classId, list);
      }
    }
    return map;
  }

  try {
    const supabase = await topicsClient();
    const { data, error } = await supabase
      .from("class_topic_meetings")
      .select("topic_id, class_id")
      .in("class_id", classIds);
    if (error) {
      console.error("[class-topics] ids", error.message);
      return map;
    }
    for (const row of data ?? []) {
      const list = map.get(row.class_id) ?? [];
      list.push(row.topic_id);
      map.set(row.class_id, list);
    }
  } catch (error) {
    console.error("[class-topics] ids", error);
  }
  return map;
}

/**
 * Single published topic with at least one today/future meeting.
 * Prefer the one whose next meeting is soonest. Returns null if none.
 */
export async function loadUpcomingHomeTopic(): Promise<ClassTopicRow | null> {
  const topics = await loadClassTopics({ includeDrafts: false });
  const { upcoming } = splitClassTopics(topics);
  return upcoming[0] ?? null;
}
