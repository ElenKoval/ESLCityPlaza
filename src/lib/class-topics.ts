import { CLASS_DURATION_MS } from "@/lib/enrollment";
import { formatClassHours } from "@/lib/class-schedule";
import type { ClassTopicRow } from "@/lib/types";

export const CLASS_TOPIC_TITLE_MAX = 80;
export const CLASS_TOPIC_CONTENT_MAX = 8000;

export function formatClassDay(startsAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(startsAt));
}

export function classTopicWhenLabel(startsAt: string) {
  return `${formatClassDay(startsAt)} · ${formatClassHours(startsAt)}`;
}

export function classIsUpcoming(startsAt: string, now = new Date()) {
  return new Date(startsAt).getTime() + CLASS_DURATION_MS > now.getTime();
}

export function splitClassTopics(topics: ClassTopicRow[], now = new Date()) {
  const upcoming: ClassTopicRow[] = [];
  const past: ClassTopicRow[] = [];
  for (const topic of topics) {
    const starts = topic.class_starts_at;
    if (starts && classIsUpcoming(starts, now)) upcoming.push(topic);
    else past.push(topic);
  }
  upcoming.sort(
    (a, b) =>
      new Date(a.class_starts_at || 0).getTime() -
      new Date(b.class_starts_at || 0).getTime(),
  );
  past.sort(
    (a, b) =>
      new Date(b.class_starts_at || 0).getTime() -
      new Date(a.class_starts_at || 0).getTime(),
  );
  return { upcoming, past };
}
