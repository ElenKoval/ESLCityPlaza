import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import { canManageClassTopics } from "@/lib/roles";
import { classTopicWhenLabel } from "@/lib/class-topics";
import { loadClassTopic } from "@/lib/load-class-topics";
import { sitePageTitle } from "@/lib/site-name";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { profile } = await requireApproved();
  const topic = await loadClassTopic(id, profile.role);
  return {
    title: topic
      ? sitePageTitle(topic.title)
      : sitePageTitle("Class topic"),
  };
}

export default async function ClassTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireApproved();
  const staff = canManageClassTopics(profile.role);
  const topic = await loadClassTopic(id, profile.role);
  if (!topic) notFound();

  return (
    <div className="page">
      <section className="section topic-page">
        <h1>{topic.title}</h1>
        {topic.class_starts_at && (
          <p className="lead">{classTopicWhenLabel(topic.class_starts_at)}</p>
        )}
        {staff && (
          <p className="class-actions">
            <span className="class-meta" style={{ alignSelf: "center" }}>
              {topic.is_published ? "Published" : "Draft"}
            </span>
            <Link href={`/topics/${topic.id}/edit`} className="btn-primary">
              Edit
            </Link>
          </p>
        )}
        <div className="panel">
          <h2 className="announce-manage__title">Questions for discussion</h2>
          <div className="topic-body">{topic.content}</div>
        </div>
        <p className="topic-back">
          <Link href="/topics">Back to Class Topics</Link>
          {" · "}
          <Link href="/">Back to home</Link>
        </p>
      </section>
    </div>
  );
}
