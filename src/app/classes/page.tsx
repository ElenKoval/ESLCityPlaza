import { requireApproved } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClassList } from "@/components/ClassList";
import { CLASS_DURATION_MS } from "@/lib/enrollment";
import {
  attachWaitlistToClasses,
  loadWaitlistRows,
} from "@/lib/load-waitlist";
import { loadTopicSummariesByClassIds } from "@/lib/load-class-topics";
import type { ClassRow } from "@/lib/types";

export default async function ClassesPage() {
  const { userId } = await requireApproved();
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .gte("starts_at", new Date(Date.now() - CLASS_DURATION_MS).toISOString())
    .order("starts_at", { ascending: true });

  const ids = (classes ?? []).map((c) => c.id);
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  let waitRows: Awaited<ReturnType<typeof loadWaitlistRows>> = [];

  if (ids.length) {
    const [{ data: enrollments }, waits] = await Promise.all([
      supabase.from("enrollments").select("class_id, user_id").in("class_id", ids),
      loadWaitlistRows(supabase, ids),
    ]);
    waitRows = waits;

    for (const row of enrollments ?? []) {
      counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
      if (row.user_id === userId) mine.add(row.class_id);
    }
  }

  const items: ClassRow[] = attachWaitlistToClasses(
    (classes ?? []).map((c) => ({
      ...c,
      enrollment_count: counts.get(c.id) ?? 0,
      enrolled: mine.has(c.id),
    })),
    waitRows,
    userId,
  );

  const topicMap = await loadTopicSummariesByClassIds(items.map((c) => c.id));
  const topics: Record<string, { id: string; title: string }> = {};
  for (const [classId, topic] of topicMap) topics[classId] = topic;

  return (
    <div className="page">
      <section className="section">
        <h2>Meetings</h2>
        <p className="lead">
          Sign up for an upcoming session. You can cancel anytime.
        </p>
        <ClassList items={items} topics={topics} />
      </section>
    </div>
  );
}
