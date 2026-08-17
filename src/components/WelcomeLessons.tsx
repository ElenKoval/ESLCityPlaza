"use client";

import { CancelClassControl } from "@/components/CancelClassControl";
import { ClassTopicChip } from "@/components/ClassTopicChip";
import { CLASS_DURATION_MS } from "@/lib/enrollment";
import { classLocation, formatClassHours } from "@/lib/class-schedule";
import type { ClassRow } from "@/lib/types";

function formatClassDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

export function WelcomeLessons({
  classes,
  topics,
}: {
  classes: ClassRow[];
  topics?: Record<string, { id: string; title: string }>;
}) {
  const mine = classes
    .filter(
      (c) =>
        c.enrolled &&
        new Date(c.starts_at).getTime() + CLASS_DURATION_MS > Date.now(),
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    )
    .slice(0, 4);

  if (mine.length === 0) {
    return (
      <div className="welcome-lessons">
        <h2 className="welcome-lessons__title">My classes</h2>
        <p className="welcome-lessons__empty">
          You&apos;re not signed up for any upcoming classes yet.
        </p>
        <a href="#home-cal" className="welcome-lessons__cal-link">
          View calendar
        </a>
      </div>
    );
  }

  return (
    <div className="welcome-lessons">
      <h2 className="welcome-lessons__title">My classes</h2>
      <ul className="welcome-lessons__list">
        {mine.map((c) => (
          <li key={c.id} className="welcome-lessons__item">
            <p className="welcome-lessons__day">{formatClassDay(c.starts_at)}</p>
            <div className="welcome-lessons__row">
              <div>
                <p className="welcome-lessons__time">
                  {formatClassHours(c.starts_at)}
                </p>
                <p className="welcome-lessons__place">{classLocation(c.location)}</p>
                <ClassTopicChip topic={topics?.[c.id]} />
              </div>
              <CancelClassControl classId={c.id} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
