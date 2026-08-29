import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { ClassTopicForm } from "@/components/ClassTopicForm";
import { loadClassesForTopicForm } from "@/lib/load-class-topics";
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
  const requested = (params.class_id || "").trim();
  const classes = await loadClassesForTopicForm(
    requested ? [requested] : [],
  );

  return (
    <div className="page">
      <section className="section">
        <h1>Add class topic</h1>
        <p className="lead">
          Choose one or more Monday or Friday meetings, paste your questions,
          then save a draft or publish.
        </p>
        {classes.length === 0 ? (
          <p>No upcoming Monday or Friday classes to attach a topic to yet.</p>
        ) : (
          <ClassTopicForm
            classes={classes}
            initialClassIds={requested ? [requested] : undefined}
          />
        )}
      </section>
    </div>
  );
}
