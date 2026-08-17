import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import { canManageClassTopics } from "@/lib/roles";
import { formatClassHours } from "@/lib/class-schedule";
import { loadClassTopic } from "@/lib/load-class-topics";

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
      ? `${topic.title} — ESL on the Plaza`
      : "Class topic — ESL on the Plaza",
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
          <p className="lead">
            {new Intl.DateTimeFormat("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            }).format(new Date(topic.class_starts_at))}
            <br />
            {formatClassHours(topic.class_starts_at)}
          </p>
        )}
        {staff && (
          <p className="class-meta">
            {topic.is_published ? "Published" : "Draft"}
            {" · "}
            <Link href={`/topics/${topic.id}/edit`}>Edit</Link>
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
