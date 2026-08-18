import { normalizeAvatarColor } from "@/lib/avatar-color";
import type { Role } from "@/lib/types";

export type ChatPresenceMeta = {
  user_id: string;
  display_name: string;
  role: Role;
  avatar_color?: string | null;
};

/** One row per user; Supabase presence key is user id, but we dedupe defensively. */
export function collectOnlineUsers(
  state: Record<string, ChatPresenceMeta[]>,
): ChatPresenceMeta[] {
  const byId = new Map<string, ChatPresenceMeta>();

  for (const metas of Object.values(state)) {
    for (const meta of metas) {
      const id = meta?.user_id;
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        user_id: id,
        display_name: meta.display_name || "Member",
        role: meta.role || "student",
        avatar_color: normalizeAvatarColor(meta.avatar_color),
      });
    }
  }

  return [...byId.values()].sort((a, b) =>
    displayChatName(a.display_name).localeCompare(
      displayChatName(b.display_name),
      undefined,
      { sensitivity: "base" },
    ),
  );
}

export function displayChatName(name: string) {
  const cleaned = name.replace(/\s*\([^)]*\)\s*/g, "").trim();
  return cleaned.split(/\s+/)[0] || "Member";
}

export function chatInitial(name: string) {
  return (displayChatName(name)[0] || "?").toUpperCase();
}

export function chatInitialColor(color?: string | null) {
  return normalizeAvatarColor(color);
}

export function showOnlineRoleBadge(role: Role) {
  return role === "teacher" || role === "admin" || role === "tech";
}
