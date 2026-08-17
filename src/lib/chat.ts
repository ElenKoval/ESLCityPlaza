import type { MessageRow, Role } from "@/lib/types";

export type ChatMessage = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  display_name: string;
  role: Role;
  is_announcement?: boolean;
  image_path?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  imageUrl?: string | null;
  file_path?: string | null;
  file_name?: string | null;
  fileUrl?: string | null;
};

export function toChatMessages(
  rows: Array<
    MessageRow & { profiles?: { display_name: string; role: Role } | null }
  >,
  urls: Record<string, string> = {},
  fileUrls: Record<string, string> = {},
): ChatMessage[] {
  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    body: row.body,
    created_at: row.created_at,
    display_name: row.profiles?.display_name ?? "Member",
    role: row.profiles?.role ?? "student",
    is_announcement: Boolean(row.is_announcement),
    image_path: row.image_path ?? null,
    image_width: row.image_width ?? null,
    image_height: row.image_height ?? null,
    imageUrl: row.image_path ? urls[row.image_path] ?? null : null,
    file_path: row.file_path ?? null,
    file_name: row.file_name ?? null,
    fileUrl: row.file_path ? fileUrls[row.file_path] ?? null : null,
  }));
}

export function chatTimeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);

  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);

  if (dayDiff === 0) return time;
  if (dayDiff === 1) return `Yesterday · ${time}`;
  return `${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(d)} · ${time}`;
}
