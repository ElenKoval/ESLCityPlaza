"use client";

import { CancelClassControl } from "@/components/CancelClassControl";
import type { ClassRow } from "@/lib/types";

function formatClassDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

export function WelcomeLessons({ classes }: { classes: ClassRow[] }) {
  const mine = classes
    .filter((c) => c.enrolled && new Date(c.starts_at).getTime() > Date.now())
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    )
    .slice(0, 4);

  if (mine.length === 0) return null;

  return (
    <div className="welcome-lessons">
      <h2 className="welcome-lessons__title">My classes</h2>
      <ul className="welcome-lessons__list">
        {mine.map((c) => (
          <li key={c.id} className="welcome-lessons__item">
            <p className="welcome-lessons__day">{formatClassDay(c.starts_at)}</p>
            <div className="welcome-lessons__row">
              <p className="welcome-lessons__time">1:00–3:00 PM</p>
              <CancelClassControl classId={c.id} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
