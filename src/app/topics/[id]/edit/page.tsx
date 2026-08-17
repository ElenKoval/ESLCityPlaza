import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { ClassTopicForm } from "@/components/ClassTopicForm";
import {
  loadClassTopic,
  loadTopicIdsByClassIds,
  loadUpcomingClassesForTopics,
} from "@/lib/load-class-topics";
import { createClient } from "@/lib/supabase/server";
import { hasDemoSession, useLocalDemo } from "@/lib/demo";
import { getDemoClassesWithEnrollments } from "@/lib/demo-classes";
import type { ClassRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Edit class topic — ESL on the Plaza",
};

export default async function EditClassTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireStaff();
  const { id } = await params;
  const topic = await loadClassTopic(id, profile.role);
  if (!topic) notFound();

  let classes = await loadUpcomingClassesForTopics();
  if (!classes.some((row) => row.id === topic.class_id) && topic.class_starts_at) {
    const extra: ClassRow = {
      id: topic.class_id,
      title: topic.class_title || "Class",
      description: "",
      location: topic.class_location,
      starts_at: topic.class_starts_at,
      capacity: 15,
      created_by: null,
      created_at: topic.created_at,
    };
    if (useLocalDemo() || (await hasDemoSession())) {
      const demo = await getDemoClassesWithEnrollments();
      const match = demo.find((row) => row.id === topic.class_id);
      classes = match ? [match, ...classes] : [extra, ...classes];
    } else {
      const supabase = await createClient();
      const { data } = await supabase
        .from("classes")
        .select("*")
        .eq("id", topic.class_id)
        .maybeSingle();
      classes = data ? [data as ClassRow, ...classes] : [extra, ...classes];
    }
  }

  const existing = await loadTopicIdsByClassIds(classes.map((row) => row.id));
  if (existing.get(topic.class_id) && existing.get(topic.class_id) !== topic.id) {
    redirect(`/topics/${existing.get(topic.class_id)}/edit`);
  }
  const existingByClass: Record<string, string> = {};
  for (const [classId, topicId] of existing) existingByClass[classId] = topicId;

  return (
    <div className="page">
      <section className="section">
        <h1>Edit class topic</h1>
        <p className="lead">
          Change the title or questions, publish when ready, or take it back to
          draft.
        </p>
        <ClassTopicForm
          classes={classes}
          existingByClass={existingByClass}
          topic={topic}
        />
      </section>
    </div>
  );
}
