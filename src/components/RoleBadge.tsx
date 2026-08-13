import type { Role } from "@/lib/types";
import { ROLE_BADGE_CLASS, ROLE_LABELS } from "@/lib/roles";

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`role-badge ${ROLE_BADGE_CLASS[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}
