/** Max people on a class waitlist */
export const WAITLIST_MAX = 6;

export const WAITLIST_FULL_MESSAGE = "Waitlist is full (6 people).";

export function waitlistPositionLabel(position: number) {
  if (position <= 0) return "You’re on the waitlist";
  if (position === 1) return "You’re #1 on the waitlist";
  return `You’re #${position} on the waitlist`;
}

export function waitlistCountLabel(count: number) {
  const n = Math.max(0, count);
  if (n === 0) return "Waitlist empty";
  if (n === 1) return "1 on waitlist";
  return `${n} on waitlist`;
}
