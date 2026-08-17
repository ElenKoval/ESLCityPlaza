/** Max students per class */
export const CLASS_CAPACITY = 15;

export const CLASS_FULL_MESSAGE =
  "Class full, please check again later for an available spot.";

/** Sign-up opens this many days before the class (not earlier) */
export const ENROLL_OPEN_DAYS = 14;

/** Class runs 1:00–3:00 PM, so keep it visible until it ends */
export const CLASS_DURATION_MS = 2 * 60 * 60 * 1000;

/** Monday = 1, Friday = 5 */
export function isClassWeekday(day: number) {
  return day === 1 || day === 5;
}

/** True if this class start is a Plaza calendar day (Mon/Fri in Los Angeles). */
export function isPlazaCalendarClass(startsAt: string) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
  }).format(new Date(startsAt));
  return weekday === "Mon" || weekday === "Fri";
}

export function isClassDate(d: Date) {
  return isClassWeekday(d.getDay());
}

export function enrollmentOpensAt(startsAt: string | Date) {
  const start = new Date(startsAt);
  const opens = new Date(start);
  opens.setDate(opens.getDate() - ENROLL_OPEN_DAYS);
  return opens;
}

export function canEnrollNow(startsAt: string | Date, now = new Date()) {
  const start = new Date(startsAt);
  if (start.getTime() <= now.getTime()) return false;
  return now.getTime() >= enrollmentOpensAt(start).getTime();
}

export function enrollStatus(startsAt: string | Date, now = new Date()) {
  const start = new Date(startsAt);
  if (start.getTime() <= now.getTime()) return "past" as const;
  if (now.getTime() < enrollmentOpensAt(start).getTime()) {
    return "too_early" as const;
  }
  return "open" as const;
}

export function spotsAvailableLabel(taken: number, capacity: number) {
  const left = Math.max(0, capacity - taken);
  if (left === 0) return CLASS_FULL_MESSAGE;
  if (left === 1) return "1 spot available";
  return `${left} spots available`;
}
