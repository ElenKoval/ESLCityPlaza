import { CLASS_CAPACITY, CLASS_DURATION_MS } from "@/lib/enrollment";
import type { ClassRow } from "@/lib/types";

export const DEFAULT_CLASS_LOCATION = "on the Plaza";
export const DEFAULT_CLASS_HOURS = "1:00–3:00 PM";
export const PLAZA_TIME_ZONE = "America/Los_Angeles";

const HORIZON_DAYS = 56;

export function classLocation(location?: string | null) {
  const trimmed = location?.trim();
  return trimmed || DEFAULT_CLASS_LOCATION;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function laDateParts(instant: Date | string) {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLAZA_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(map.year),
    monthIndex: Number(map.month) - 1,
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday] ?? -1,
    dateStr: `${map.year}-${map.month}-${map.day}`,
  };
}

export function laWeekdayNumber(instant: Date | string) {
  return laDateParts(instant).weekday;
}

export function sameLaCalendarDay(a: string, b: string) {
  return laDateParts(a).dateStr === laDateParts(b).dateStr;
}

export function formatClassWhen(startsAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PLAZA_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(startsAt));
}

export function formatClassDateTime(startsAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PLAZA_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(startsAt));
}

export function formatClassHours(startsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + CLASS_DURATION_MS);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PLAZA_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${fmt.format(start)}–${fmt.format(end)}`;
}

function sessionAtHourIso(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute = 0,
) {
  const dateStr = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
  const timeStr = `${pad(hour)}:${pad(minute)}:00`;
  for (const offset of ["-07:00", "-08:00"] as const) {
    const instant = new Date(`${dateStr}T${timeStr}${offset}`);
    const la = laDateParts(instant);
    if (la.dateStr === dateStr && la.hour === hour && la.minute === minute) {
      return instant.toISOString();
    }
  }
  const utcHour = hour + 7;
  return new Date(
    `${dateStr}T${pad(utcHour)}:${pad(minute)}:00.000Z`,
  ).toISOString();
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

export function fromLosAngelesDatetimeLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthIndex) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }
  const iso = sessionAtHourIso(year, monthIndex, day, hour, minute);
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toLosAngelesDatetimeLocal(iso: string) {
  const la = laDateParts(iso);
  return `${la.dateStr}T${pad(la.hour)}:${pad(la.minute)}`;
}

/** Monday/Friday in California that has not yet ended (after 3:00 PM PT). */
export function isUpcomingClassDate(d: Date, now = new Date()) {
  const iso = sessionStartsAtForDate(d);
  const weekday = laWeekdayNumber(iso);
  if (weekday !== 1 && weekday !== 5) return false;
  return new Date(sessionEndsAtForDate(d)).getTime() > now.getTime();
}

export function upcomingSessionStarts(now = new Date()) {
  const today = laDateParts(now);
  const out: string[] = [];
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const cursor = new Date(Date.UTC(today.year, today.monthIndex, today.day));
    cursor.setUTCDate(cursor.getUTCDate() + i);
    const year = cursor.getUTCFullYear();
    const monthIndex = cursor.getUTCMonth();
    const day = cursor.getUTCDate();
    const iso = sessionStartsAtIso(year, monthIndex, day);
    const weekday = laWeekdayNumber(iso);
    if (weekday !== 1 && weekday !== 5) continue;
    if (new Date(iso).getTime() > now.getTime()) out.push(iso);
  }
  return out;
}

export function scheduleClassPayload(startsAt: string) {
  const weekday = laWeekdayNumber(startsAt);
  const title = weekday === 1 ? "Monday Session" : "Friday Session";
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
    location: extra?.location ?? DEFAULT_CLASS_LOCATION,
    starts_at: startsAt,
    capacity: payload.capacity,
    created_by: null,
    created_at: new Date().toISOString(),
    enrollment_count: 0,
    enrolled: false,
    ...extra,
  };
}
