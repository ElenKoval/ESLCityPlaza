"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { removeClassEnrollment, type ActionState } from "@/app/actions";
import { canRemoveFromClass } from "@/lib/roles";
import { classTopicWhenLabel } from "@/lib/class-topics";
import { signedUpCountLabel } from "@/lib/enrollment";
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

export function ClassRosterPanel({
  rosters,
  actorRole,
}: {
  rosters: ClassRoster[];
  actorRole: Role;
}) {
  if (rosters.length === 0) {
    return (
      <section className="manage-block">
        <h3 className="manage-block__title">Who signed up</h3>
        <p className="manage-empty">No upcoming classes</p>
      </section>
    );
  }

  return (
    <section className="manage-block">
      <h3 className="manage-block__title">Who signed up</h3>
      <p className="manage-fold__hint" style={{ marginTop: 0 }}>
        Open a class to see the names.
      </p>
      <div className="panel manage-panel">
        {rosters.map((item) => {
          const count = item.people.length;
          const cap = item.capacity ?? 15;
          return (
            <details key={item.classId} className="roster-class">
              <summary className="roster-class__summary">
                <span className="roster-class__when">
                  {classTopicWhenLabel(item.startsAt)}
                </span>
                <span className="roster-class__count">
                  {signedUpCountLabel(count, cap)}
                </span>
              </summary>
              <ClassSignupList
                classId={item.classId}
                people={item.people}
                actorRole={actorRole}
              />
            </details>
          );
        })}
      </div>
    </section>
  );
}
