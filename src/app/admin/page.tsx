import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminClasses } from "@/components/AdminClasses";
import { loadClassRostersFor } from "@/lib/load-class-rosters";
import type { ClassRow } from "@/lib/types";

export default async function AdminPage() {
  const { profile } = await requireStaff();
  const supabase = await createClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("*")
    .order("starts_at", { ascending: true });

  const classRows = classes ?? [];
  const ids = classRows.map((c) => c.id);
  const counts = new Map<string, number>();

  if (ids.length) {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("class_id")
      .in("class_id", ids);
    for (const row of enrollments ?? []) {
      counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
    }
  }

  const items: ClassRow[] = classRows.map((c) => ({
    ...c,
    enrollment_count: counts.get(c.id) ?? 0,
  }));
  const rosters = await loadClassRostersFor(supabase, classRows);

  return (
    <div className="page">
      <section className="section">
        <h2>Schedule</h2>
        <p className="lead">
          Open <strong>Who signed up</strong> on a class to see the names.
          Teachers can change the meeting place. Tech can also change time,
          title, and capacity.
        </p>
        <AdminClasses classes={items} role={profile.role} rosters={rosters} />
      </section>
    </div>
  );
}
