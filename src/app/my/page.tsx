import { requireApproved } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClassList } from "@/components/ClassList";
import { DemoMyLessons } from "@/components/DemoMyLessons";
import { hasDemoSession, useLocalDemo } from "@/lib/demo";
import { getDemoClassesWithEnrollments } from "@/lib/demo-classes";
import type { ClassRow } from "@/lib/types";

export default async function MyLessonsPage() {
  const { userId } = await requireApproved();
  const demoMode = useLocalDemo() || (await hasDemoSession());

  let items: ClassRow[] = [];

  if (demoMode) {
    items = (await getDemoClassesWithEnrollments())
      .filter((c) => c.enrolled)
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      );
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
          Dates you signed up for. Sign up from the home page calendar.
        </p>
        {demoMode ? (
          <DemoMyLessons initial={items} />
        ) : (
          <ClassList
            items={items}
            emptyText="You have no lessons yet. Pick a Monday or Friday on the home calendar."
          />
        )}
      </section>
    </div>
  );
}
