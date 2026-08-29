import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { canManageClassTopics } from "@/lib/roles";
import {
  classIsUpcoming,
  classTopicWhenLabel,
} from "@/lib/class-topics";
import { loadClassTopic } from "@/lib/load-class-topics";
import { sitePageTitle } from "@/lib/site-name";
import { topicContentToDisplayHtml } from "@/lib/topic-html";
import { TopicPrintButton } from "@/components/TopicPrintButton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { profile } = await getProfile();
  const topic = await loadClassTopic(id, profile?.role);
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
  const { profile } = await getProfile();
  const staff =
    profile?.status === "approved" && canManageClassTopics(profile.role);
  const topic = await loadClassTopic(id, profile?.role);
  if (!topic) notFound();

  const bodyHtml = topicContentToDisplayHtml(topic.content);
  const meetings = topic.meetings ?? [];
  const upcomingMeetings = meetings.filter((m) =>
    classIsUpcoming(m.class_starts_at),
  );
  const showMeetings =
    upcomingMeetings.length > 0 ? upcomingMeetings : meetings;

  return (
    <div className="page">
      <section className="section topic-page">
        <article className="topic-print-root">
          <h1>{topic.title}</h1>
          {showMeetings.length === 1 && (
            <p className="lead topic-print__when">
              {classTopicWhenLabel(showMeetings[0].class_starts_at)}
            </p>
          )}
          {showMeetings.length > 1 && (
            <ul className="topic-meetings-summary lead topic-print__when">
              {showMeetings.map((meeting) => (
                <li key={meeting.class_id}>
                  {classTopicWhenLabel(meeting.class_starts_at)}
                </li>
              ))}
            </ul>
          )}
          <div className="panel topic-print__panel">
            <h2 className="announce-manage__title topic-no-print">
              Questions for discussion
            </h2>
            <div
              className="topic-body"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </div>
        </article>
        <div className="topic-page__toolbar topic-no-print">
          <TopicPrintButton />
          {staff && (
            <>
              <span className="class-meta">
                {topic.is_published ? "Published" : "Draft"}
              </span>
              <Link href={`/topics/${topic.id}/edit`} className="btn-primary">
                Edit
              </Link>
            </>
          )}
        </div>
        <p className="topic-back topic-no-print">
          {profile?.status === "approved" ? (
            <>
              <Link href="/topics">Back to Class Topics</Link>
              {" · "}
            </>
          ) : null}
          <Link href="/">Back to home</Link>
        </p>
      </section>
    </div>
  );
}
