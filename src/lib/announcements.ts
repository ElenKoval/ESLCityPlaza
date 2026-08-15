import type { AnnouncementRow, Role } from "./types";

export function isAnnouncementCurrent(row: {
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}) {
  if (!row.is_active) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return false;
  }
  return true;
}

export function sortAnnouncements<T extends { is_important: boolean; created_at: string }>(
  rows: T[],
) {
  return [...rows].sort((a, b) => {
    if (a.is_important !== b.is_important) return a.is_important ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function toPublicAnnouncement(
  row: AnnouncementRow,
  author?: { display_name: string; role: Role } | null,
): AnnouncementRow {
  return {
    ...row,
    author_name: author?.display_name ?? row.author_name ?? "Member",
    author_role: author?.role ?? row.author_role ?? "student",
  };
}
