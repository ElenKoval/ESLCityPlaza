import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { ClassTopicForm } from "@/components/ClassTopicForm";
import {
  loadTopicIdsByClassIds,
  loadUpcomingClassesForTopics,
} from "@/lib/load-class-topics";

import { sitePageTitle } from "@/lib/site-name";

export const metadata: Metadata = {
  title: sitePageTitle("Add class topic"),
};

export default async function NewClassTopicPage({
  searchParams,
}: {
  searchParams: Promise<{ class_id?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const classes = await loadUpcomingClassesForTopics();
  const existing = await loadTopicIdsByClassIds(classes.map((row) => row.id));
  const requested = (params.class_id || "").trim();
  if (requested && existing.get(requested)) {
    redirect(`/topics/${existing.get(requested)}/edit`);
  }

  const existingByClass: Record<string, string> = {};
  for (const [classId, topicId] of existing) existingByClass[classId] = topicId;

  return (
    <div className="page">
      <section className="section">
        <h1>Add class topic</h1>
        <p className="lead">
          Choose an upcoming Monday or Friday class, paste your questions, then
          save a draft or publish.
        </p>
        {classes.length === 0 ? (
          <p>No upcoming Monday or Friday classes to attach a topic to yet.</p>
        ) : (
          <ClassTopicForm classes={classes} existingByClass={existingByClass} />
        )}
      </section>
    </div>
  );
}
