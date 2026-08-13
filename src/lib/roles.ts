export type Role = "student" | "volunteer" | "teacher" | "tech";

export const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  volunteer: "Volunteer",
  teacher: "Teacher",
  tech: "Tech",
};

export const ROLE_BADGE_CLASS: Record<Role, string> = {
  student: "badge-student",
  volunteer: "badge-volunteer",
  teacher: "badge-teacher",
  tech: "badge-tech",
};

export function canManageClasses(role: Role) {
  return role === "teacher" || role === "tech";
}

export function canReviewApplications(role: Role) {
  return role === "tech";
}
