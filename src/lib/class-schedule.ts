import { CLASS_CAPACITY } from "@/lib/enrollment";
import type { ClassRow } from "@/lib/types";

const HORIZON_DAYS = 56;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function sessionAtHourIso(
  year: number,
  monthIndex: number,
  day: number,
  hour: 13 | 15,
) {
  const dateStr = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
  const utcFallbackHour = hour === 13 ? 20 : 22;
  for (const offset of ["-07:00", "-08:00"] as const) {
    const instant = new Date(
      `${dateStr}T${pad(hour)}:00:00${offset}`,
    );
    const laDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
    const laHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "numeric",
        hour12: false,
      }).format(instant),
    );
    if (laDay === dateStr && laHour === hour) return instant.toISOString();
  }
  return new Date(`${dateStr}T${pad(utcFallbackHour)}:00:00.000Z`).toISOString();
}

/** 1:00 PM America/Los_Angeles on this calendar day */
export function sessionStartsAtIso(year: number, monthIndex: number, day: number) {
  return sessionAtHourIso(year, monthIndex, day, 13);
}

/** 3:00 PM America/Los_Angeles on this calendar day */
export function sessionEndsAtIso(year: number, monthIndex: number, day: number) {
  return sessionAtHourIso(year, monthIndex, day, 15);
}

export function sessionStartsAtForDate(d: Date) {
  return sessionStartsAtIso(d.getFullYear(), d.getMonth(), d.getDate());
}

export function sessionEndsAtForDate(d: Date) {
  return sessionEndsAtIso(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday/Friday that has not yet ended (after 3:00 PM). */
export function isUpcomingClassDate(d: Date, now = new Date()) {
  if (d.getDay() !== 1 && d.getDay() !== 5) return false;
  return new Date(sessionEndsAtForDate(d)).getTime() > now.getTime();
}

export function upcomingSessionStarts(now = new Date()) {
  const out: string[] = [];
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (d.getDay() !== 1 && d.getDay() !== 5) continue;
    const iso = sessionStartsAtForDate(d);
    if (new Date(iso).getTime() > now.getTime()) out.push(iso);
  }
  return out;
}

export function scheduleClassPayload(startsAt: string) {
  const when = new Date(startsAt);
  const title = when.getDay() === 1 ? "Monday Session" : "Friday Session";
  return {
    title,
    description: "1:00 PM – 3:00 PM practice with the group",
    starts_at: startsAt,
    capacity: CLASS_CAPACITY,
  };
}

export function asScheduleRow(
  id: string,
  startsAt: string,
  extra?: Partial<ClassRow>,
): ClassRow {
  const payload = scheduleClassPayload(startsAt);
  return {
    id,
    title: payload.title,
    description: payload.description,
    starts_at: startsAt,
    capacity: payload.capacity,
    created_by: null,
    created_at: new Date().toISOString(),
    enrollment_count: 0,
    enrolled: false,
    ...extra,
  };
}
