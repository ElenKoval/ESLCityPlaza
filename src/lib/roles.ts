import type { Role } from "./types";

export type { Role };

export const ROLE_LABELS: Record<Role, string> = {
  student: "STUDENT",
  teacher: "TEACHER",
  admin: "ADMIN",
  tech: "TECH",
};

export const ROLE_BADGE_CLASS: Record<Role, string> = {
  student: "badge-student",
  teacher: "badge-teacher",
  admin: "badge-admin",
  tech: "badge-tech",
};

export const CHAT_UNAVAILABLE_TITLE = "Chat unavailable";

export const CHAT_UNAVAILABLE_MESSAGE =
  "You don't currently have access to the Community Chat.";

/** Server-side denial when a muted member hits a chat action. */
export const CHAT_ACCESS_DENIED = CHAT_UNAVAILABLE_MESSAGE;

export function canAccessCommunityChat(profile: { muted?: boolean }) {
  return !profile.muted;
}

/** Teacher or Tech — teaching/schedule staff. Do NOT include ADMIN. */
export function isStaff(role: Role) {
  return role === "teacher" || role === "tech";
}

export function canManageClasses(role: Role) {
  return isStaff(role);
}

/** Teacher and Tech can change the meeting place. */
export function canEditClassLocation(role: Role) {
  return isStaff(role);
}

/** Only Tech can change time, title, capacity, and other class fields. */
export function canEditClassSchedule(role: Role) {
  return role === "tech";
}

export function canManageClassTopics(role: Role) {
  return isStaff(role);
}

export function canReviewApplications(role: Role) {
  return role === "teacher" || role === "admin" || role === "tech";
}

export function canManageAnnouncements(role: Role) {
  return role === "teacher" || role === "admin" || role === "tech";
}

export function canAnnounce(role: Role) {
  return canManageAnnouncements(role);
}

/** Teacher, Admin, and Tech can delete others' chat messages (Admin: students only). */
export function canModerateChat(role: Role) {
  return role === "teacher" || role === "admin" || role === "tech";
}

export function canDeleteChatMessage(
  actor: { id: string; role: Role },
  message: { user_id: string; role: Role },
) {
  if (message.user_id === actor.id) return true;
  if (actor.role === "teacher" || actor.role === "tech") return true;
  if (actor.role === "admin") return message.role === "student";
  return false;
}

export function canSeeModerationStatus(role: Role) {
  return role === "teacher" || role === "admin" || role === "tech";
}

export function canModerateMembers(role: Role) {
  return role === "admin" || role === "tech";
}

export function canManageRoles(role: Role) {
  return role === "tech";
}

export function canViewClassRoster(role: Role) {
  return role === "teacher" || role === "admin" || role === "tech";
}

export function canRemoveFromClass(actorRole: Role, targetRole: Role) {
  if (actorRole === "tech") return true;
  if (actorRole === "admin") return targetRole === "student";
  return false;
}

/** TECH may assign these via member management. TECH itself is protected. */
export function assignableRoles(): Role[] {
  return ["student", "teacher", "admin"];
}

export function canModerateAccount(actorRole: Role, targetRole: Role) {
  if (targetRole === "tech") return false;
  if (actorRole === "tech") return true;
  if (actorRole === "admin") return targetRole === "student";
  return false;
}

export function canDeleteMember(
  actor: { id: string; role: Role },
  target: { id: string; role: Role },
) {
  if (target.role === "tech") return false;
  if (actor.id === target.id) return false;
  return actor.role === "tech";
}
