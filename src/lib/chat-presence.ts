import type { Role } from "@/lib/types";

export type ChatPresenceMeta = {
  user_id: string;
  display_name: string;
  role: Role;
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

const LETTER_COLORS = [
  "#c4510c",
  "#2f6f4e",
  "#3d5a80",
  "#9a3412",
  "#6b3fa0",
  "#0f766e",
];

export function chatInitialColor(name: string) {
  let n = 0;
  for (const ch of name) n = (n + ch.charCodeAt(0)) % LETTER_COLORS.length;
  return LETTER_COLORS[n];
}

export function showOnlineRoleBadge(role: Role) {
  return role === "teacher" || role === "admin" || role === "tech";
}
