import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { classTopicWhenLabel } from "@/lib/class-topics";
import { loadClassTopic } from "@/lib/load-class-topics";
import { sitePageTitle } from "@/lib/site-name";
import { topicContentToPlainText } from "@/lib/topic-html";
import { TopicCopyTextButton } from "@/components/TopicCopyTextButton";

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
      ? sitePageTitle(`${topic.title} · Text`)
      : sitePageTitle("Topic text"),
  };
}

export default async function TopicTextPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await getProfile();
  const topic = await loadClassTopic(id, profile?.role);
  if (!topic) notFound();

  const meetings = topic.meetings ?? [];
  const dates = meetings
    .map((m) => classTopicWhenLabel(m.class_starts_at))
    .filter(Boolean);
  const bodyText = topicContentToPlainText(topic.content);
  const copyText = [
    topic.title,
    dates.length ? dates.join("\n") : "",
    bodyText,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="page topic-text-page">
      <section className="section topic-text">
        <p className="topic-text__nav">
          <Link href={`/topics/${topic.id}`}>← Back to topic</Link>
        </p>
        <h1 className="topic-text__title">{topic.title}</h1>
        {dates.length > 0 && (
          <ul className="topic-text__dates">
            {dates.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        )}
        <TopicCopyTextButton text={copyText} />
        <pre className="topic-text__body">{bodyText}</pre>
        <TopicCopyTextButton text={copyText} />
        <p className="topic-text__nav">
          <Link href={`/topics/${topic.id}`}>← Back to topic</Link>
        </p>
      </section>
    </div>
  );
}
