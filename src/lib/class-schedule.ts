import { CLASS_CAPACITY } from "@/lib/enrollment";
import type { ClassRow } from "@/lib/types";

const HORIZON_DAYS = 56;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** 1:00 PM America/Los_Angeles on this calendar day */
export function sessionStartsAtIso(year: number, monthIndex: number, day: number) {
  const dateStr = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
  for (const offset of ["-07:00", "-08:00"] as const) {
    const instant = new Date(`${dateStr}T13:00:00${offset}`);
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
    if (laDay === dateStr && laHour === 13) return instant.toISOString();
  }
  return new Date(`${dateStr}T20:00:00.000Z`).toISOString();
}

export function sessionStartsAtForDate(d: Date) {
  return sessionStartsAtIso(d.getFullYear(), d.getMonth(), d.getDate());
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
