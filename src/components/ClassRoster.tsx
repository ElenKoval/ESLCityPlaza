"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { removeClassEnrollment, type ActionState } from "@/app/actions";
import { canRemoveFromClass } from "@/lib/roles";
import type { ClassRoster, Role } from "@/lib/types";

function useRefreshOnSuccess(state: ActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);
}

function RemoveSignupForm({
  classId,
  userId,
  name,
  targetRole,
  actorRole,
}: {
  classId: string;
  userId: string;
  name: string;
  targetRole: Role;
  actorRole: Role;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    removeClassEnrollment,
    null,
  );
  useRefreshOnSuccess(state);
  if (!canRemoveFromClass(actorRole, targetRole)) return null;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Remove ${name} from this class?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="class_id" value={classId} />
      <input type="hidden" name="user_id" value={userId} />
      <button className="manage-text-btn" type="submit" disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}

export function ClassSignupList({
  classId,
  people,
  actorRole,
}: {
  classId: string;
  people: ClassRoster["people"];
  actorRole: Role;
}) {
  if (people.length === 0) {
    return <p className="roster-class__empty">No one signed up yet.</p>;
  }

  return (
    <ul className="roster-list">
      {people.map((person) => (
        <li key={person.userId} className="roster-list__row">
          <span>{person.displayName}</span>
          <RemoveSignupForm
            classId={classId}
            userId={person.userId}
            name={person.displayName}
            targetRole={person.role}
            actorRole={actorRole}
          />
        </li>
      ))}
    </ul>
  );
}
