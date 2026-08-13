import { requireApproved } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClassList } from "@/components/ClassList";
import type { ClassRow } from "@/lib/types";

export default async function ClassesPage() {
  const { userId } = await requireApproved();
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .gte("starts_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order("starts_at", { ascending: true });

  const ids = (classes ?? []).map((c) => c.id);
  const counts = new Map<string, number>();
  const mine = new Set<string>();

  if (ids.length) {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("class_id, user_id")
      .in("class_id", ids);

    for (const row of enrollments ?? []) {
      counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
      if (row.user_id === userId) mine.add(row.class_id);
    }
  }

  const items: ClassRow[] = (classes ?? []).map((c) => ({
    ...c,
    enrollment_count: counts.get(c.id) ?? 0,
    enrolled: mine.has(c.id),
  }));

  return (
    <div className="page">
      <section className="section">
        <h2>Classes</h2>
        <p className="lead">
          Sign up for an upcoming session. You can cancel anytime.
        </p>
        <ClassList items={items} />
      </section>
    </div>
  );
}
