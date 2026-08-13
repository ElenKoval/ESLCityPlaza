"use client";

import { useActionState } from "react";
import {
  createClass,
  deleteClass,
  type ActionState,
} from "@/app/actions";
import type { ClassRow } from "@/lib/types";

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
        Date and time
        <input name="starts_at" type="datetime-local" required />
      </label>
      <p className="sub" style={{ margin: 0, fontSize: "0.85rem" }}>
        Classes are only on Monday or Wednesday.
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

export function AdminClasses({ classes }: { classes: ClassRow[] }) {
  return (
    <div className="stack">
      <CreateClassForm />
      <div className="panel class-list">
        {classes.length === 0 && <p>Nothing yet — create the first class.</p>}
        {classes.map((item) => (
          <article key={item.id} className="class-item">
            <h3>{item.title}</h3>
            <div className="class-meta">
              <span>
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(item.starts_at))}
              </span>
              <span>Capacity: {item.capacity}</span>
              <span>Signed up: {item.enrollment_count ?? 0}</span>
            </div>
            <DeleteButton id={item.id} />
          </article>
        ))}
      </div>
    </div>
  );
}
