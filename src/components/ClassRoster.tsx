"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { removeClassEnrollment, type ActionState } from "@/app/actions";
import { canRemoveFromClass } from "@/lib/roles";
import { classTopicWhenLabel } from "@/lib/class-topics";
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

export function ClassRosterPanel({
  rosters,
  actorRole,
}: {
  rosters: ClassRoster[];
  actorRole: Role;
}) {
  const filled = rosters.filter((item) => item.people.length > 0);
  const total = filled.reduce((sum, item) => sum + item.people.length, 0);

  if (filled.length === 0) {
    return (
      <section className="manage-fold manage-fold--static">
        <p className="manage-fold__title">Class sign-ups</p>
        <p className="manage-fold__hint">No upcoming registrations</p>
      </section>
    );
  }

  const summary =
    total === 1
      ? `1 registration across ${filled.length} upcoming class${filled.length === 1 ? "" : "es"}`
      : `${total} registrations across ${filled.length} upcoming class${filled.length === 1 ? "" : "es"}`;

  return (
    <details className="manage-fold">
      <summary>
        <span className="manage-fold__title">Class sign-ups</span>
        <span className="manage-fold__hint">{summary}</span>
      </summary>
      <div className="manage-fold__body">
        {filled.map((item) => (
          <article key={item.classId} className="roster-class">
            <h4 className="roster-class__title">
              {classTopicWhenLabel(item.startsAt)}
            </h4>
            <p className="class-meta">
              <span>
                {item.people.length} signed up
              </span>
            </p>
            <ul className="roster-list">
              {item.people.map((person) => (
                <li key={person.userId} className="roster-list__row">
                  <span>{person.displayName}</span>
                  <RemoveSignupForm
                    classId={item.classId}
                    userId={person.userId}
                    name={person.displayName}
                    targetRole={person.role}
                    actorRole={actorRole}
                  />
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </details>
  );
}
