import type { MessageRow, Role } from "@/lib/types";

export type ChatMessage = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  display_name: string;
  role: Role;
  is_announcement?: boolean;
};

export function toChatMessages(
  rows: Array<
    MessageRow & { profiles?: { display_name: string; role: Role } | null }
  >,
): ChatMessage[] {
  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    body: row.body,
    created_at: row.created_at,
    display_name: row.profiles?.display_name ?? "Member",
    role: row.profiles?.role ?? "student",
    is_announcement: Boolean(row.is_announcement),
  }));
}
