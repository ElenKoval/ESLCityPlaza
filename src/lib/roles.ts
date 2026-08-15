export type Role = "student" | "teacher" | "tech";

export const ROLE_LABELS: Record<Role, string> = {
  student: "STUDENT",
  teacher: "TEACHER",
  tech: "TECH",
};

export const ROLE_BADGE_CLASS: Record<Role, string> = {
  student: "badge-student",
  teacher: "badge-teacher",
  tech: "badge-tech",
};

export function isStaff(role: Role) {
  return role === "teacher" || role === "tech";
}

export function canManageClasses(role: Role) {
  return isStaff(role);
}

export function canReviewApplications(role: Role) {
  return isStaff(role);
}

export function canManageAnnouncements(role: Role) {
  return isStaff(role);
}

export function canAnnounce(role: Role) {
  return isStaff(role);
}

export function assignableRoles(): Role[] {
  return ["student", "teacher"];
}

export function canDeleteMember(
  actor: { id: string; role: Role },
  target: { id: string; role: Role },
) {
  if (target.role === "tech") return false;
  if (actor.id === target.id) return false;
  if (actor.role === "tech") return true;
  if (actor.role === "teacher") return target.role === "student";
  return false;
}
