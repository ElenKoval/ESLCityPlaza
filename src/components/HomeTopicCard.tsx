import {
  formatUpcomingMeetingDatesCompact,
  topicHasCurrentMeeting,
} from "@/lib/class-topics";
import { stripTopicHtml } from "@/lib/topic-html";
import type { ClassTopicRow } from "@/lib/types";

function previewText(content: string, max = 110) {
  const text = stripTopicHtml(content).replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function HomeTopicCard({ topic }: { topic: ClassTopicRow }) {
  const href = `/topics/${topic.id}`;
  const dates = formatUpcomingMeetingDatesCompact(topic.meetings ?? []);
  const preview = previewText(topic.content);
  const label = topicHasCurrentMeeting(topic) ? "Upcoming Topic" : "Topic";

  return (
    <aside className="home-topic panel">
      <a href={href} className="btn-primary home-topic__cta">
        {label}
      </a>
      <p className="home-topic__name">{topic.title}</p>
      {dates ? <p className="home-topic__dates">{dates}</p> : null}
      {preview ? <p className="home-topic__preview">{preview}</p> : null}
      <a href={href} className="home-topic__link">
        View topic →
      </a>
    </aside>
  );
}
