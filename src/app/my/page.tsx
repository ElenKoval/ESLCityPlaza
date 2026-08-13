import { requireApproved } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClassList } from "@/components/ClassList";
import { useLocalDemo } from "@/lib/demo";
import type { ClassRow } from "@/lib/types";

function demoMyLessons(): ClassRow[] {
  return [];
}

export default async function MyLessonsPage() {
  const { userId } = await requireApproved();

  let items: ClassRow[] = [];

  if (useLocalDemo()) {
    items = demoMyLessons();
  } else {
    const supabase = await createClient();
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("class_id, classes(*)")
      .eq("user_id", userId);

    items = (enrollments ?? [])
      .map((row) => {
        const c = row.classes as unknown as ClassRow | ClassRow[] | null;
        const cls = Array.isArray(c) ? c[0] : c;
        if (!cls) return null;
        return { ...cls, enrolled: true };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(a!.starts_at).getTime() - new Date(b!.starts_at).getTime(),
      ) as ClassRow[];
  }

  return (
    <div className="page">
      <section className="section">
        <h2>My lessons</h2>
        <p className="lead">
          Dates you signed up for. Sign up from the home page calendar — open
          only within 2 weeks before each class (max 15 people).
        </p>
        <ClassList
          items={items}
          emptyText="You have no lessons yet. Pick a Monday or Wednesday on the home calendar."
        />
      </section>
    </div>
  );
}
