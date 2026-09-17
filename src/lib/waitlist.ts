/** Max people on a class waitlist */
export const WAITLIST_MAX = 6;

export const WAITLIST_FULL_MESSAGE = "Waitlist is full (6 people).";

export function waitlistPositionLabel(_position?: number) {
  return "You’re on the waitlist";
}

export function waitlistCountLabel(count: number) {
  const n = Math.max(0, count);
  if (n === 0) return "Waitlist empty";
  if (n === 1) return "1 on waitlist";
  return `${n} on waitlist`;
}
