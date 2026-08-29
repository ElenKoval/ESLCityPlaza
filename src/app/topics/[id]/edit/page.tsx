import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { ClassTopicForm } from "@/components/ClassTopicForm";
import {
  loadClassTopic,
  loadClassesForTopicForm,
} from "@/lib/load-class-topics";
import { sitePageTitle } from "@/lib/site-name";

export const metadata: Metadata = {
  title: sitePageTitle("Edit class topic"),
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

  const linkedIds = topic.meetings?.map((m) => m.class_id) || [];
  const classes = await loadClassesForTopicForm(linkedIds);

  return (
    <div className="page">
      <section className="section">
        <h1>Edit class topic</h1>
        <p className="lead">
          Change the title or questions, link more meetings, publish when ready,
          or take it back to draft.
        </p>
        {classes.length === 0 ? (
          <p>No meetings available to link yet.</p>
        ) : (
          <ClassTopicForm classes={classes} topic={topic} />
        )}
      </section>
    </div>
  );
}
