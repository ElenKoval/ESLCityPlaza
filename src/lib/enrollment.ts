/** Max students per class */
export const CLASS_CAPACITY = 15;

/** Sign-up opens this many days before the class (not earlier) */
export const ENROLL_OPEN_DAYS = 14;

/** Class runs 1:00–3:00 PM, so keep it visible until it ends */
export const CLASS_DURATION_MS = 2 * 60 * 60 * 1000;

/** Monday = 1, Friday = 5 */
export function isClassWeekday(day: number) {
  return day === 1 || day === 5;
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
  if (left === 0) return "No spots available";
  if (left === 1) return "1 spot available";
  return `${left} spots available`;
}
