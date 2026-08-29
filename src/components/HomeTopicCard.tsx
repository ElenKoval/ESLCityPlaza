import { stripTopicHtml } from "@/lib/topic-html";
import {
  formatUpcomingMeetingDatesCompact,
} from "@/lib/class-topics";
import type { ClassTopicRow } from "@/lib/types";

function previewText(content: string, max = 110) {
  const text = stripTopicHtml(content).replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function HomeTopicCard({ topic }: { topic: ClassTopicRow }) {
  const dates = formatUpcomingMeetingDatesCompact(topic.meetings ?? []);
  const preview = previewText(topic.content);

  return (
    <aside className="home-topic panel">
      <h2 className="home-topic__title">Upcoming Topic</h2>
      <p className="home-topic__name">{topic.title}</p>
      {dates ? <p className="home-topic__dates">{dates}</p> : null}
      {preview ? <p className="home-topic__preview">{preview}</p> : null}
      <a href={`/topics/${topic.id}`} className="home-topic__link">
        View topic →
      </a>
    </aside>
  );
}
