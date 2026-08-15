"use client";

import { useActionState, useState } from "react";
import {
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
  type ActionState,
} from "@/app/actions";
import { RoleBadge } from "@/components/RoleBadge";
import type { AnnouncementRow } from "@/lib/types";

function dateInputValue(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function CreateForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createAnnouncement,
    null,
  );

  return (
    <form action={action} className="panel form-grid">
      <h3 className="announce-form__heading">Create announcement</h3>
      <label>
        Title
        <input name="title" required maxLength={120} />
      </label>
      <label>
        Message
        <textarea name="body" required maxLength={2000} rows={4} />
      </label>
      <label>
        Show until
        <input name="expires_at" type="date" />
      </label>
      <p className="field-hint">Optional</p>
      <label className="check-row">
        <input type="checkbox" name="is_important" />
        Important
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Posting…" : "Post announcement"}
      </button>
    </form>
  );
}

function EditRow({ item }: { item: AnnouncementRow }) {
  const [editing, setEditing] = useState(false);
  const [saveState, saveAction, saving] = useActionState<ActionState, FormData>(
    updateAnnouncement,
    null,
  );
  const [delState, delAction, deleting] = useActionState<ActionState, FormData>(
    deleteAnnouncement,
    null,
  );

  if (!editing) {
    return (
      <article className={`panel announce-item ${item.is_important ? "is-important" : ""}`}>
        <h3>{item.title}</h3>
        <p className="announce-item__body">{item.body}</p>
        <p className="class-meta">
          <span>{item.author_name}</span>
          {item.author_role && <RoleBadge role={item.author_role} />}
          <span>
            {new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
            }).format(new Date(item.created_at))}
          </span>
          {!item.is_active && <span>Hidden</span>}
        </p>
        <div className="class-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!confirm("Delete this announcement?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={item.id} />
            <button className="btn-danger" type="submit" disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </form>
        </div>
        {delState?.error && <p className="error">{delState.error}</p>}
      </article>
    );
  }

  return (
    <form action={saveAction} className="panel form-grid">
      <input type="hidden" name="id" value={item.id} />
      <label>
        Title
        <input name="title" required maxLength={120} defaultValue={item.title} />
      </label>
      <label>
        Message
        <textarea
          name="body"
          required
          maxLength={2000}
          rows={4}
          defaultValue={item.body}
        />
      </label>
      <label>
        Show until
        <input
          name="expires_at"
          type="date"
          defaultValue={dateInputValue(item.expires_at)}
        />
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          name="is_important"
          defaultChecked={item.is_important}
        />
        Important
      </label>
      <label className="check-row">
        <input type="checkbox" name="is_active" defaultChecked={item.is_active} />
        Active
      </label>
      {saveState?.error && <p className="error">{saveState.error}</p>}
      <div className="class-actions">
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AnnouncementManager({ items }: { items: AnnouncementRow[] }) {
  return (
    <div className="stack">
      <CreateForm />
      <div className="stack">
        {items.length === 0 && (
          <p className="sub">No announcements yet.</p>
        )}
        {items.map((item) => (
          <EditRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
