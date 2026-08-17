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
      <button className="btn-ghost" type="submit" disabled={pending}>
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
  return (
    <section className="panel stack">
      <h3 style={{ margin: 0, fontFamily: "var(--font-display)" }}>
        Class sign-ups
      </h3>
      <p className="lead" style={{ margin: 0 }}>
        See who is signed up for a class. You can remove a student if needed.
      </p>
      {rosters.length === 0 ? (
        <p style={{ margin: 0 }}>No upcoming classes.</p>
      ) : (
        <div className="stack">
          {rosters.map((item) => (
            <article key={item.classId} className="roster-class">
              <h4 className="roster-class__title">{item.title}</h4>
              <p className="class-meta">
                <span>
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.startsAt))}
                </span>
                <span>{item.people.length} signed up</span>
              </p>
              {item.people.length === 0 ? (
                <p className="sub" style={{ margin: 0 }}>
                  No one is signed up yet.
                </p>
              ) : (
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
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
