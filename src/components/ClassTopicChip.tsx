import Link from "next/link";

export function ClassTopicChip({
  topic,
}: {
  topic?: { id: string; title: string } | null;
}) {
  if (!topic) return null;
  return (
    <p className="topic-chip">
      <strong>Topic: {topic.title}</strong>
      <Link href={`/topics/${topic.id}`} prefetch>
        View topic
      </Link>
    </p>
  );
}
