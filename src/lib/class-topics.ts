import { CLASS_DURATION_MS } from "@/lib/enrollment";
import { formatClassHours } from "@/lib/class-schedule";
import type { ClassTopicMeeting, ClassTopicRow } from "@/lib/types";

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

/** Checkbox label: "Aug 28, 1:00–3:00 PM" */
export function meetingCheckboxLabel(startsAt: string) {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
  }).format(new Date(startsAt));
  return `${day}, ${formatClassHours(startsAt)}`;
}

/** Compact home dates: "Aug 31 & Sep 4" */
export function formatUpcomingMeetingDatesCompact(
  meetings: ClassTopicMeeting[],
  now = new Date(),
) {
  const upcoming = sortMeetings(meetings).filter((m) =>
    classIsUpcoming(m.class_starts_at, now),
  );
  if (!upcoming.length) return "";

  const short = (startsAt: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
    }).format(new Date(startsAt));

  if (upcoming.length === 1) return short(upcoming[0].class_starts_at);
  if (upcoming.length === 2) {
    return `${short(upcoming[0].class_starts_at)} & ${short(upcoming[1].class_starts_at)}`;
  }
  if (upcoming.length === 3) {
    return `${short(upcoming[0].class_starts_at)}, ${short(upcoming[1].class_starts_at)} & ${short(upcoming[2].class_starts_at)}`;
  }
  return `${short(upcoming[0].class_starts_at)}, ${short(upcoming[1].class_starts_at)} & ${upcoming.length - 2} more`;
}

export function classIsUpcoming(startsAt: string, now = new Date()) {
  return new Date(startsAt).getTime() + CLASS_DURATION_MS > now.getTime();
}

export function sortMeetings(meetings: ClassTopicMeeting[]) {
  return [...meetings].sort(
    (a, b) =>
      new Date(a.class_starts_at).getTime() -
      new Date(b.class_starts_at).getTime(),
  );
}

/** Next upcoming meeting, or latest past if all finished. */
export function primaryMeeting(
  meetings: ClassTopicMeeting[],
  now = new Date(),
): ClassTopicMeeting | undefined {
  const sorted = sortMeetings(meetings);
  if (!sorted.length) return undefined;
  const upcoming = sorted.filter((m) => classIsUpcoming(m.class_starts_at, now));
  if (upcoming.length) return upcoming[0];
  return sorted[sorted.length - 1];
}

export function withPrimaryMeetingFields(
  topic: Omit<ClassTopicRow, "class_id" | "class_title" | "class_starts_at" | "class_location"> & {
    meetings: ClassTopicMeeting[];
  },
  now = new Date(),
): ClassTopicRow {
  const meetings = sortMeetings(topic.meetings ?? []);
  const primary = primaryMeeting(meetings, now);
  return {
    ...topic,
    meetings,
    class_id: primary?.class_id,
    class_title: primary?.class_title,
    class_starts_at: primary?.class_starts_at,
    class_location: primary?.class_location,
  };
}

export function topicHasCurrentMeeting(topic: ClassTopicRow, now = new Date()) {
  return (topic.meetings ?? []).some((m) =>
    classIsUpcoming(m.class_starts_at, now),
  );
}

export function splitClassTopics(topics: ClassTopicRow[], now = new Date()) {
  const upcoming: ClassTopicRow[] = [];
  const past: ClassTopicRow[] = [];
  for (const topic of topics) {
    if (topicHasCurrentMeeting(topic, now)) upcoming.push(topic);
    else past.push(topic);
  }
  upcoming.sort((a, b) => {
    const aStart =
      primaryMeeting(a.meetings, now)?.class_starts_at ||
      a.class_starts_at ||
      "";
    const bStart =
      primaryMeeting(b.meetings, now)?.class_starts_at ||
      b.class_starts_at ||
      "";
    return new Date(aStart).getTime() - new Date(bStart).getTime();
  });
  past.sort((a, b) => {
    const aStart = a.class_starts_at || "";
    const bStart = b.class_starts_at || "";
    return new Date(bStart).getTime() - new Date(aStart).getTime();
  });
  return { upcoming, past };
}
