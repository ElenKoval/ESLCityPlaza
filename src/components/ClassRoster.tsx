"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  addClassEnrollment,
  promoteWaitlistMember,
  removeClassEnrollment,
  removeWaitlistMember,
  type ActionState,
} from "@/app/actions";
import { canAddToClass, canRemoveFromClass } from "@/lib/roles";
import type { ClassRoster, Role } from "@/lib/types";

export type RosterMemberOption = {
  id: string;
  display_name: string;
  role: Role;
};

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

function WaitlistRowActions({
  classId,
  userId,
  name,
  targetRole,
  actorRole,
  canPromote,
}: {
  classId: string;
  userId: string;
  name: string;
  targetRole: Role;
  actorRole: Role;
  canPromote: boolean;
}) {
  const [promoteState, promoteAction, promoting] = useActionState<
    ActionState,
    FormData
  >(promoteWaitlistMember, null);
  const [removeState, removeAction, removing] = useActionState<
    ActionState,
    FormData
  >(removeWaitlistMember, null);
  useRefreshOnSuccess(promoteState);
  useRefreshOnSuccess(removeState);

  if (!canRemoveFromClass(actorRole, targetRole)) return null;

  return (
    <div className="roster-list__actions">
      {canPromote && (
        <form
          action={promoteAction}
          onSubmit={(e) => {
            if (!confirm(`Move ${name} from the waitlist into this class?`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="class_id" value={classId} />
          <input type="hidden" name="user_id" value={userId} />
          <button className="manage-text-btn" type="submit" disabled={promoting}>
            {promoting ? "Moving…" : "Add to class"}
          </button>
        </form>
      )}
      <form
        action={removeAction}
        onSubmit={(e) => {
          if (!confirm(`Remove ${name} from the waitlist?`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="class_id" value={classId} />
        <input type="hidden" name="user_id" value={userId} />
        <button className="manage-text-btn" type="submit" disabled={removing}>
          {removing ? "Removing…" : "Remove"}
        </button>
      </form>
      {(promoteState?.error || removeState?.error) && (
        <p className="error">{promoteState?.error || removeState?.error}</p>
      )}
    </div>
  );
}

function AddMemberForm({
  classId,
  people,
  waitlist,
  members,
  actorRole,
  seatsLeft,
}: {
  classId: string;
  people: ClassRoster["people"];
  waitlist: ClassRoster["waitlist"];
  members: RosterMemberOption[];
  actorRole: Role;
  seatsLeft: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addClassEnrollment,
    null,
  );
  useRefreshOnSuccess(state);

  const taken = new Set([
    ...people.map((p) => p.userId),
    ...(waitlist ?? []).map((p) => p.userId),
  ]);
  const options = members
    .filter(
      (m) => !taken.has(m.id) && canAddToClass(actorRole, m.role),
    )
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  if (options.length === 0 && seatsLeft > 0) {
    return (
      <p className="roster-class__empty">
        No other approved participants to add.
      </p>
    );
  }

  if (seatsLeft <= 0) {
    return (
      <p className="roster-class__empty">
        Meeting is full — free a seat or use the waitlist.
      </p>
    );
  }

  return (
    <form action={action} className="roster-add">
      <input type="hidden" name="class_id" value={classId} />
      <label className="roster-add__label">
        Add participant
        <select name="user_id" required defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn-secondary" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
    </form>
  );
}

export function ClassSignupList({
  classId,
  people,
  waitlist = [],
  capacity,
  actorRole,
  members = [],
}: {
  classId: string;
  people: ClassRoster["people"];
  waitlist?: ClassRoster["waitlist"];
  capacity?: number;
  actorRole: Role;
  members?: RosterMemberOption[];
}) {
  const seatsLeft =
    typeof capacity === "number"
      ? Math.max(0, capacity - people.length)
      : 0;
  const waiting = waitlist ?? [];

  return (
    <div className="roster-sections">
      {people.length === 0 ? (
        <p className="roster-class__empty">No one signed up yet.</p>
      ) : (
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
      )}

      <AddMemberForm
        classId={classId}
        people={people}
        waitlist={waiting}
        members={members}
        actorRole={actorRole}
        seatsLeft={seatsLeft}
      />

      <div className="roster-waitlist">
        <p className="roster-waitlist__title">
          Waitlist{waiting.length ? ` (${waiting.length})` : ""}
        </p>
        {waiting.length === 0 ? (
          <p className="roster-class__empty">No one on the waitlist.</p>
        ) : (
          <ul className="roster-list">
            {waiting.map((person) => (
              <li key={person.userId} className="roster-list__row">
                <span>{person.displayName}</span>
                <WaitlistRowActions
                  classId={classId}
                  userId={person.userId}
                  name={person.displayName}
                  targetRole={person.role}
                  actorRole={actorRole}
                  canPromote={seatsLeft > 0}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
