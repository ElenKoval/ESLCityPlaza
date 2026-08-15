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

export const BIO_EXAMPLE =
  "For example: I moved to California five years ago. I enjoy cooking, walking, and meeting new people.";

export function needsProfileSetup(profile: Profile | null): boolean {
  if (!profile || profile.status !== "approved") return false;
  if (!Object.prototype.hasOwnProperty.call(profile, "onboarding_completed_at")) {
    return false;
  }
  return !profile.onboarding_completed_at;
}
