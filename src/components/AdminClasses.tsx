"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createClass,
  deleteClass,
  updateClass,
  type ActionState,
} from "@/app/actions";
import {
  classLocation,
  DEFAULT_CLASS_LOCATION,
  formatClassDateTime,
  toLosAngelesDatetimeLocal,
} from "@/lib/class-schedule";
import { ClassSignupList } from "@/components/ClassRoster";
import { canEditClassSchedule, type Role } from "@/lib/roles";
import type { ClassRoster, ClassRow } from "@/lib/types";

function CreateClassForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createClass,
    null,
  );

  return (
    <form action={action} className="panel form-grid">
      <label>
        Title
        <input name="title" required maxLength={120} />
      </label>
      <label>
        Description
        <textarea name="description" maxLength={1000} />
      </label>
      <label>
        Location
        <input
          name="location"
          maxLength={120}
          defaultValue={DEFAULT_CLASS_LOCATION}
        />
      </label>
      <label>
        Date and time
        <input name="starts_at" type="datetime-local" required />
      </label>
      <p className="sub" style={{ margin: 0, fontSize: "0.85rem" }}>
        Classes are only on Monday or Friday.
      </p>
      <label>
        Capacity
        <input
          name="capacity"
          type="number"
          min={1}
          max={15}
          defaultValue={15}
        />
      </label>
      <p className="sub" style={{ margin: 0, fontSize: "0.85rem" }}>
        Max 15 people. Sign-up opens 2 weeks before the class.
      </p>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add class"}
      </button>
    </form>
  );
}

function DeleteButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    deleteClass,
    null,
  );
  return (
    <form action={action}>
      <input type="hidden" name="class_id" value={id} />
      <button className="btn-danger" type="submit" disabled={pending}>
        Delete
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}

function EditClassForm({ item, role }: { item: ClassRow; role: Role }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateClass,
    null,
  );
  const tech = canEditClassSchedule(role);

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);

  return (
    <details className="class-edit">
      <summary>Edit</summary>
      <form action={action} className="form-grid class-edit__form">
        <input type="hidden" name="class_id" value={item.id} />
        {tech && (
          <>
            <label>
              Title
              <input
                name="title"
                required
                maxLength={120}
                defaultValue={item.title}
              />
            </label>
            <label>
              Description
              <textarea name="description" maxLength={1000} defaultValue={item.description} />
            </label>
          </>
        )}
        <label>
          Location
          <input
            name="location"
            maxLength={120}
            defaultValue={classLocation(item.location)}
          />
        </label>
        {tech && (
          <>
            <label>
              Date and time
              <input
                name="starts_at"
                type="datetime-local"
                required
                defaultValue={toLosAngelesDatetimeLocal(item.starts_at)}
              />
            </label>
            <label>
              Capacity
              <input
                name="capacity"
                type="number"
                min={1}
                max={15}
                defaultValue={item.capacity}
              />
            </label>
          </>
        )}
        {state?.error && <p className="error">{state.error}</p>}
        {state?.success && <p className="success">{state.success}</p>}
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </details>
  );
}

export function AdminClasses({
  classes,
  role,
  rosters,
}: {
  classes: ClassRow[];
  role: Role;
  rosters: ClassRoster[];
}) {
  const peopleByClass = new Map(rosters.map((item) => [item.classId, item]));

  return (
    <div className="stack">
      <CreateClassForm />
      <div className="panel class-list">
        {classes.length === 0 && <p>Nothing yet — create the first class.</p>}
        {classes.map((item) => {
          const roster = peopleByClass.get(item.id);
          const people = roster?.people ?? [];
          return (
            <article key={item.id} className="class-item">
              <h3>{item.title}</h3>
              <div className="class-meta">
                <span>{formatClassDateTime(item.starts_at)}</span>
                <span>{classLocation(item.location)}</span>
                <span>Capacity: {item.capacity}</span>
                <span>Signed up: {item.enrollment_count ?? 0}</span>
              </div>
              <details className="class-signups">
                <summary>
                  Who signed up
                  {people.length > 0 ? ` (${people.length})` : ""}
                </summary>
                <ClassSignupList
                  classId={item.id}
                  people={people}
                  actorRole={role}
                />
              </details>
              <div className="class-actions">
                <EditClassForm item={item} role={role} />
                <DeleteButton id={item.id} />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
