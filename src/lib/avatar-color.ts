export const DEFAULT_AVATAR_COLOR = "#c4510c";

export const AVATAR_COLORS = [
  "#c4510c",
  "#2f6f4e",
  "#3d5a80",
  "#9a3412",
  "#6b3fa0",
  "#0f766e",
] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];

export function avatarColumnMissing(message: string) {
  return /avatar_color|schema cache|does not exist/i.test(message);
}

export function normalizeAvatarColor(color?: string | null): AvatarColor {
  const value = (color ?? "").trim().toLowerCase();
  const match = AVATAR_COLORS.find((item) => item.toLowerCase() === value);
  return match ?? DEFAULT_AVATAR_COLOR;
}
