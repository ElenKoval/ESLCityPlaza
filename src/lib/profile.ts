import type { Profile } from "./types";

export const INTEREST_CHIPS = [
  "Travel",
  "Food",
  "Family",
  "Movies",
  "Books",
  "Music",
  "Gardening",
  "Technology",
  "Sports",
  "Art",
  "History",
  "Nature",
  "Cooking",
  "Life in the U.S.",
  "Other",
] as const;

export const MAX_INTERESTS = 5;
export const OTHER_INTEREST = "Other";
export const CUSTOM_INTEREST_MAX = 20;

export const PRESET_INTERESTS = INTEREST_CHIPS.filter(
  (chip) => chip !== OTHER_INTEREST,
);

export function normalizeCustomInterest(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, CUSTOM_INTEREST_MAX);
}

export function splitStoredInterests(values: string[]) {
  const preset = new Set<string>(PRESET_INTERESTS);
  const selected: string[] = [];
  let custom = "";
  for (const raw of values) {
    const value = raw.trim();
    if (!value || value === OTHER_INTEREST) continue;
    if (preset.has(value)) {
      if (!selected.includes(value)) selected.push(value);
      continue;
    }
    if (!custom) custom = value.slice(0, CUSTOM_INTEREST_MAX);
  }
  return { selected, custom };
}

export const BIO_EXAMPLE =
  "For example: I moved to California five years ago. I enjoy cooking, walking, and meeting new people.";

export function needsProfileSetup(profile: Profile | null): boolean {
  if (!profile || profile.status !== "approved") return false;
  if (!Object.prototype.hasOwnProperty.call(profile, "onboarding_completed_at")) {
    return false;
  }
  return !profile.onboarding_completed_at;
}
